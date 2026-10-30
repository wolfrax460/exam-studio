// One storage API for saved notes, exams and flashcards.
//
// The real work happens in lib/repository.js, which uses MongoDB when it is available and a
// local JSON file otherwise. Kept as a thin layer because the MCP server and older callers
// use these names, and because those callers have no signed-in user to pass as the owner.
import {
  initStorage, storageMode, storageStatus, resolveOwnerId, LOCAL_OWNER,
  listItems as repoListItems,
  getItem as repoGetItem,
  saveItem as repoSaveItem,
  deleteItem as repoDeleteItem,
} from './repository.js';

export { default as LibraryItem } from './models/LibraryItem.js';
export { initStorage, storageMode, storageStatus, resolveOwnerId, LOCAL_OWNER };

const owner = async (userId) => userId || (await resolveOwnerId());

export async function listItems(userId) {
  return repoListItems(await owner(userId));
}

export async function getItem(id, userId) {
  return repoGetItem(id, await owner(userId));
}

export async function saveItem({ kind, title, data, userId }) {
  return repoSaveItem({ kind, title, data, userId: await owner(userId) });
}

export async function deleteItem(id, userId) {
  return repoDeleteItem(id, await owner(userId));
}
