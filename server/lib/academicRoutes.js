import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { readAcademicStructure, writeAcademicStructure } from './academicRepository.js';
import { httpError } from './errors.js';
import { listInstitutionDirectory, listMembershipsForInstitution } from './workspaceRepository.js';

const name = z.string().trim().min(1).max(100);
const recordId = z.uuid();
const teacherId = z.string().regex(/^(?:[a-f0-9]{24}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i);
const dates = { startsOn: z.iso.date(), endsOn: z.iso.date() };
const version = z.number().int().nonnegative();
const schemas = {
  years: z.strictObject({ name, ...dates, archived: z.boolean().default(false) }),
  terms: z.strictObject({ name, ...dates, yearId: recordId }),
  classes: z.strictObject({ name, yearId: recordId, teacherId: teacherId.nullish() }),
  sections: z.strictObject({ name, classId: recordId }),
  subjects: z.strictObject({ name, code: z.string().trim().min(1).max(24).regex(/^[a-z0-9-]+$/i).toUpperCase() }),
  assignments: z.strictObject({ classId: recordId, sectionId: recordId.nullish(), subjectId: recordId, teacherId }),
};

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const find = (records, id) => records.find((record) => record.id === id);
const key = (value) => value.normalize('NFKC').toLowerCase();
const within = (record, year) => record.startsOn >= year.startsOn && record.endsOn <= year.endsOn;
const conflict = () => httpError(409, 'Academic records changed. Refresh and try again.');

function parse(schema, input) {
  const checked = schema.safeParse(input);
  if (checked.success) return checked.data;
  const path = checked.error.issues[0]?.path.join('.');
  throw httpError(400, path ? `Check the value of ${path}.` : 'Check the submitted fields.');
}

function validateReferences(state, kind, record, previous) {
  if (record.startsOn && record.startsOn > record.endsOn) throw httpError(400, 'The end date must follow the start date.');
  if (record.yearId) {
    const year = find(state.years, record.yearId);
    if (!year || year.archived) throw httpError(400, 'Select an available academic year.');
    if (previous && previous.yearId !== record.yearId) throw httpError(400, 'This record belongs to its original academic year.');
    if (kind === 'terms' && !within(record, year)) throw httpError(400, 'Term dates must be within the academic year.');
  }
  if (kind === 'years' && state.terms.some((term) => term.yearId === record.id && !within(term, record))) {
    throw httpError(400, 'The academic year must include the dates of its terms.');
  }
  if (record.classId) {
    const classroom = find(state.classes, record.classId);
    const year = classroom && find(state.years, classroom.yearId);
    if (!year || year.archived) throw httpError(400, 'Select a class in an available academic year.');
    if (kind === 'sections' && previous && previous.classId !== record.classId) {
      throw httpError(400, 'This section belongs to its original class.');
    }
  }
  if (record.sectionId && find(state.sections, record.sectionId)?.classId !== record.classId) {
    throw httpError(400, 'Select a section in this class.');
  }
  if (record.subjectId && !find(state.subjects, record.subjectId)) throw httpError(400, 'Select an available subject.');
}

function validateUnique(records, kind, record) {
  const peers = records.filter((item) => item.id !== record.id && item.yearId === record.yearId && item.classId === record.classId);
  if (record.name && peers.some((item) => key(item.name) === key(record.name))) {
    throw httpError(409, 'This name is already in use.');
  }
  if (record.code && peers.some((item) => item.code === record.code)) throw httpError(409, 'This subject code is already in use.');
  if (kind === 'terms' && peers.some((term) => term.startsOn <= record.endsOn && term.endsOn >= record.startsOn)) {
    throw httpError(409, 'Term dates overlap another term in this academic year.');
  }
  if (kind === 'assignments' && peers.some((item) => (item.sectionId ?? null) === (record.sectionId ?? null)
    && item.subjectId === record.subjectId && item.teacherId === record.teacherId)) {
    throw httpError(409, 'This teaching assignment already exists.');
  }
}

async function revise(institutionId, expected, change) {
  const structure = await readAcademicStructure(institutionId);
  if (structure.version !== expected) throw conflict();
  const record = await change(structure);
  structure.version += 1;
  if (!await writeAcademicStructure(institutionId, expected, structure)) throw conflict();
  return { version: structure.version, record };
}

async function saveRecord(institutionId, kind, input, id) {
  if (!Object.hasOwn(schemas, kind)) throw httpError(404, 'Academic record type not found.');
  const checked = parse(z.strictObject({ version, record: schemas[kind] }), input);
  return revise(institutionId, checked.version, async (state) => {
    const records = state[kind];
    const previous = id ? find(records, id) : null;
    if (id && !previous) throw httpError(404, 'Academic record not found.');
    if (!id && records.length >= 2000) throw httpError(409, 'The limit for this academic record type was reached.');
    const record = { id: id || randomUUID(), ...checked.record };
    validateReferences(state, kind, record, previous);
    validateUnique(records, kind, record);
    if (record.teacherId && record.teacherId !== previous?.teacherId) {
      const members = await listMembershipsForInstitution(institutionId, { statuses: ['active'] });
      if (!members.some(({ id, role }) => id === record.teacherId && role === 'teacher')) {
        throw httpError(400, 'Select an active teacher in this institution.');
      }
    }
    if (previous) records[records.indexOf(previous)] = record;
    else records.push(record);
    if (kind === 'years' && record.archived && state.activeYearId === record.id) {
      state.activeYearId = null;
      state.activeTermId = null;
    }
    return record;
  });
}

export function academicRoutes(workspaceGuard, memberAdminGuard) {
  const routes = Router();
  routes.get('/', ...workspaceGuard, wrap(async (req, res) => {
    const { institutionId, membership } = req.workspace;
    if (membership.role === 'member') throw httpError(403, 'Institution staff access required.');
    const [structure, directory] = await Promise.all([
      readAcademicStructure(institutionId),
      listInstitutionDirectory(institutionId, { statuses: ['active'] }, false),
    ]);
    const teachers = directory.filter(({ role }) => role === 'teacher').map(({ id, name }) => ({ id, name }));
    res.json({ ...structure, teachers });
  }));
  routes.post('/:kind', ...memberAdminGuard, wrap(async (req, res) => {
    res.status(201).json(await saveRecord(req.workspace.institutionId, req.params.kind, req.body));
  }));
  routes.put('/:kind/:id', ...memberAdminGuard, wrap(async (req, res) => {
    res.json(await saveRecord(req.workspace.institutionId, req.params.kind, req.body, req.params.id));
  }));
  routes.put('/active/:kind/:id', ...memberAdminGuard, wrap(async (req, res) => {
    const { kind, id } = req.params;
    if (kind !== 'years' && kind !== 'terms') throw httpError(404, 'Academic period type not found.');
    const { version: expected } = parse(z.strictObject({ version }), req.body);
    const result = await revise(req.workspace.institutionId, expected, (state) => {
      const record = find(state[kind], id);
      if (!record) throw httpError(404, 'Academic period not found.');
      if (kind === 'years') {
        if (record.archived) throw httpError(409, 'Restore this academic year before activating it.');
        if (state.activeYearId !== id) state.activeTermId = null;
        state.activeYearId = id;
      } else {
        if (record.yearId !== state.activeYearId) throw httpError(409, 'Activate this term’s academic year first.');
        state.activeTermId = id;
      }
      return record;
    });
    res.json(result);
  }));
  return routes;
}
