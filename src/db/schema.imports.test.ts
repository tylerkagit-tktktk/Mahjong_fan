import fs from 'fs';
import path from 'path';

describe('schema import guard', () => {
  it('does not import models/dealer.ts', () => {
    const schemaPath = path.resolve(__dirname, 'schema.ts');
    const source = fs.readFileSync(schemaPath, 'utf8');
    expect(source).not.toContain("from '../models/dealer'");
  });
});
