const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Chicago';
const source = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
const ctx = vm.createContext({Date, TERMINAL_DEFAULTS:{OT:{station:'04664'}}});
for (const name of ['localDay','fmtClock','myRestInfo','myStatusRows']) {
  const start=source.indexOf(`function ${name}(`);
  const end=source.indexOf('\nfunction ',start+1);
  vm.runInContext(source.slice(start,end),ctx);
}
const me={home_terminal:'OT',availability:{state:'booked_off'},
  tickets:[{date:'2026-09-14',on_duty:'2120',off_duty:'1205',train:'253-12 01'}],
  bookoff:{code:'M',since:'2026-09-15',time:'18:29',carryover:true,last_confirmed:'2026-09-16'},
  reentry:{at:'2026-09-18T00:01:00-05:00',basis:'operator_confirmed_return'}};
const rows=ctx.myStatusRows(me).rows;
assert.equal(rows.find(r=>r[0]==='TIED UP')[1],'1205 09/15');
assert.equal(rows.find(r=>r[0]==='BOOKOFF RECORDED')[1],'09-15 18:29');
assert.match(rows.find(r=>r[0].startsWith('RETURN'))[1],/mark-up/);
assert.match(rows.find(r=>r[0]==='SOURCE')[1],/Carried forward/);
console.log('Personal bookoff truth checks passed');
