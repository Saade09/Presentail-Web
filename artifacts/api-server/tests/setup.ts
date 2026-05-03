// Make the @workspace/db import side effect (which throws when DATABASE_URL
// isn't set) inert for tests by providing a sentinel value before any
// module loads. Individual test files mock the db client directly.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.WC_CONSUMER_KEY ??= "test_key";
process.env.WC_CONSUMER_SECRET ??= "test_secret";
