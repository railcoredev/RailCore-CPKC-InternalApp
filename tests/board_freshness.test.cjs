const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
const ctx = vm.createContext({ Date });
for (const name of ['formatAge', 'localTime', 'boardCaptureLabel', 'projectedCrewText']) {
  vm.runInContext(functionSource(name), ctx);
}
assert.match(ctx.boardCaptureLabel({status: 'unknown'}), /availability unknown/);
assert.match(ctx.boardCaptureLabel({captured_at: 'invalid'}), /time unknown/);
assert.match(ctx.boardCaptureLabel({captured_at: '2000-01-01T12:00:00Z'}), /OUT OF DATE/);
assert.match(ctx.boardCaptureLabel({captured_at: new Date().toISOString()}), /^Board captured:/);
assert.match(source, /\}, 30000\);/);
assert.match(source, /me\.projection_note/);
const forecast = ctx.projectedCrewText({complete:false, seats:{ET:{name:'TRAINEE',optional:true}}});
assert.match(forecast, /EN: unfilled/);
assert.match(forecast, /AE\/CO: unfilled/);
assert.match(forecast, /TRAINEE \(possible\)/);
assert.match(forecast, /advisory.*incomplete crew/);
console.log('Board freshness checks passed');
