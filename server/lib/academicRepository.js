import AcademicStructure from './models/AcademicStructure.js';
import { getFileStore, initStorage, saveFileStore, storageMode } from './repository.js';

const emptyStructure = () => ({
  version: 0, activeYearId: null, activeTermId: null, years: [], terms: [], classes: [], sections: [], subjects: [], assignments: [],
});

export async function readAcademicStructure(institutionId) {
  await initStorage();
  if (storageMode() === 'mongo') {
    const document = await AcademicStructure.findOne({ institutionId }).select('-_id -institutionId').lean();
    return document || emptyStructure();
  }
  const entry = getFileStore().academicStructures.find((entry) => entry.institutionId === institutionId);
  return entry ? structuredClone(entry.structure) : emptyStructure();
}

export async function writeAcademicStructure(institutionId, version, structure) {
  if (storageMode() === 'mongo') {
    await AcademicStructure.init();
    try {
      const result = await AcademicStructure.updateOne(
        { institutionId, version }, { $set: structure }, { upsert: version === 0, runValidators: true },
      );
      return Boolean(result.modifiedCount || result.upsertedCount);
    } catch (error) {
      if (error.code === 11000) return false;
      throw error;
    }
  }

  const entries = getFileStore().academicStructures;
  const index = entries.findIndex((entry) => entry.institutionId === institutionId);
  const previous = entries[index];
  if ((previous?.structure.version ?? 0) !== version) return false;
  const nextIndex = index === -1 ? entries.length : index;
  entries[nextIndex] = { institutionId, structure };
  try {
    saveFileStore();
  } catch (error) {
    if (previous) entries[nextIndex] = previous;
    else entries.pop();
    throw error;
  }
  return true;
}
