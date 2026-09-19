global.window = global;
global.localStorage = { getItem(){return null}, setItem(){} };
require(__dirname + '/../js/store.js');
require(__dirname + '/../js/plan.js');
// pin "today"
var realToday = Store.date.today;
Store.date.today = function(){ return new Date(2026,8,19); };

var p = Plan.generate({
  from: '2026-09-19', to: '2026-10-11',
  practiceDays: [1,4,6], baseArrows: 55, sessionMinutes: 120, setSize: 4, distance: 18
});
console.log('runway', p.runwayDays, 'days | taper starts', p.taperStart, '(' + p.taperDays + 'd) | peak', p.peak, '| cap', p.cap);
console.log('TOTAL', p.total, 'arrows across', p.sessions.length, 'sessions\n');
p.sessions.forEach(s => {
  console.log(s.date, Store.date.dowName(s.dow), String(s.arrows).padStart(3), s.phase.padEnd(6), s.sets ? ('('+s.sets+')').padEnd(16):''.padEnd(16), s.title);
});
console.log('\nWeekly:');
p.weeks.forEach(w => console.log('  wk of', w.key, w.arrows, 'arrows /', w.sessions, 'sessions', '['+w.phase+']'));
console.log('\nAdvice:'); p.advice.forEach(a=>console.log(' -', a));
console.log('\nSample session detail (' + p.sessions[1].date + '):');
p.sessions[1].blocks.forEach(b=>console.log('   ' + String(b.minutes).padStart(3) + ' min  ' + b.what));
