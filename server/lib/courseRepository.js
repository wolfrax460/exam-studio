import { randomUUID } from 'node:crypto';
import Course from './models/InstitutionCourse.js';
import { getFileStore, initStorage, saveFileStore, storageMode } from './repository.js';
import { httpError } from './errors.js';

export async function listCourses(institutionId, filter, matches, { offset, limit }) {
  await initStorage();
  if (storageMode() === 'mongo') {
    return Course.find({ institutionId, ...filter }).select('-_id -institutionId -lessons.content -lessons.resources -lessons.objectives -lessons.description')
      .sort({ title: 1, id: 1 }).skip(offset).limit(limit).lean();
  }
  return getFileStore().institutionCourses.filter((row) => row.institutionId === institutionId && matches(row))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(offset, offset + limit);
}

export async function readCourse(institutionId, id) {
  await initStorage();
  return storageMode() === 'mongo'
    ? Course.findOne({ institutionId, id }).select('-_id -institutionId').lean()
    : structuredClone(getFileStore().institutionCourses.find((row) => row.institutionId === institutionId && row.id === id));
}

export async function saveCourse(institutionId, data, previous) {
  await initStorage();
  const changed = () => httpError(409, 'This course changed. Reopen it and try again.');
  const id = previous?.id || randomUUID();
  const version = (previous?.version ?? 0) + 1;
  const record = { ...previous, ...data, id, institutionId, version };
  if (storageMode() === 'mongo') {
    if (previous) {
      const updated = await Course.updateOne({ institutionId, id, version: previous.version }, { $set: { ...data, version } }, { runValidators: true });
      if (!updated.modifiedCount) throw changed();
    } else await Course.create(record);
  } else {
    const rows = getFileStore().institutionCourses;
    const index = previous ? rows.findIndex((row) => row.institutionId === institutionId && row.id === id) : rows.length;
    const old = rows[index];
    if (previous && old?.version !== previous.version) throw changed();
    rows[index] = record;
    try { saveFileStore(); } catch (error) {
      if (old) rows[index] = old;
      else rows.pop();
      throw error;
    }
  }
  return record;
}
