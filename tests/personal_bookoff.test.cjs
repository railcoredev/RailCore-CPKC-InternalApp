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

const scheduleUnknown = {...me, reentry:{at:null,basis:'schedule_return_unresolved',
  schedule:{id:'5-2',source:'assignment_override'}, note:'Schedule unresolved; rest is not mark-up'}};
const unknownRows = ctx.myStatusRows(scheduleUnknown).rows;
assert.match(unknownRows.find(r=>r[0]==='BACK ON BOARD')[1],/not confirmed/);
assert.equal(unknownRows.find(r=>r[0]==='RETURN BASIS')[1],scheduleUnknown.reentry.note);
const withoutBookoff = ctx.myStatusRows({...scheduleUnknown,bookoff:null,availability:{state:'resting'}});
assert.equal(withoutBookoff.label,'RETURN UNCONFIRMED');
assert.ok(!withoutBookoff.rows.some(r=>r[0]==='ON BOARD SINCE'));
const assumed = {...me,reentry:{at:'2099-09-24T06:00',into_rest_days:true,
  schedule:{id:'6-2',source:'default'},note:'Assumes default 6-and-2 schedule'}};
assert.equal(ctx.myStatusRows(assumed).rows.find(r=>r[0]==='RETURN BASIS')[1],assumed.reentry.note);
console.log('Schedule uncertainty checks passed');

ctx.localTime = v => v;
const staleStanding={home_terminal:'OT',availability:{state:'availability_unknown'},tickets:[],
 board_position:{ordinal:1,of:4,board:'TEST',captured_at:'2000-01-01T00:00:00Z'}};
const guarded=ctx.myStatusRows(staleStanding);
assert.equal(guarded.band,'grey');
assert.equal(guarded.label,'AVAILABILITY UNCONFIRMED');
assert.ok(guarded.rows.some(r=>r[0]==='LAST BOARD POSITION'));
assert.ok(!guarded.rows[0][1].includes('1st out'));
const fresh={...staleStanding,availability:{state:'on_board'},
 board_position:{...staleStanding.board_position,captured_at:new Date().toISOString()}};
assert.equal(ctx.myStatusRows(fresh).band,'red');
assert.equal(ctx.myStatusRows({...fresh,availability:{state:'availability_unknown'}}).band,'grey');
assert.ok(!source.includes('Grading silently against real calls'));
console.log('Unknown and stale standing headline checks passed');
