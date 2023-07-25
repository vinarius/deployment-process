import { createIndex, deleteIndex } from './openSearch';

// TODO: delete me

async function foo() {
  try {
    await deleteIndex('users');

    console.log('deleted');

    await createIndex('users');

    console.log('created');
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

foo();
