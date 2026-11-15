// Private SQL adapters pass JSON.stringify(...) text for explicitly cast JSON
// parameters. postgres.js otherwise JSON.stringify's that text a second time.
// Override both PostgreSQL JSON OIDs, while keeping normal JSON result parsing.
export const techsafePostgresJsonTypes = {
 json: {
  to: 114,
  from: [114, 3802],
  serialize: value => typeof value === 'string' ? value : JSON.stringify(value),
  parse: value => JSON.parse(value),
 },
};
