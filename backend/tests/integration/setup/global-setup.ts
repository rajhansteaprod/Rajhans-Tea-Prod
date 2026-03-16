export default async function globalSetup() {
  // Will connect to test MongoDB when integration tests are active
  process.env.NODE_ENV = 'test';
}
