global.window = global;
require(__dirname + '/../js/parse.js');
var today = new Date(2026,8,19); // Sat Sep 19 2026
var cases = [
  "65 arrows in sets of 4 today",
  "60 arrows",
  "12 ends of 6 at 70m",
  "80 arrows sets of 6, 90 min, felt rough",
  "yesterday 50 arrows",
  "sep 15 70 arrows at 18m rpe 4",
  "thu 72 arrows 2h scoring 545/600",
  "6 dozen blank bale",
  "55",
  "3 days ago 40 arrows tuning bare shaft",
  "90 arrows 18m 1h30m",
  "monday 60 arrows spt holds felt strong",
  "10/3 64 arrows at 18m",
  "48 arrows in sets of 4, shoulder a bit sore"
];
cases.forEach(function(c){
  var p = Parse.parse(c, {today: today});
  console.log(JSON.stringify(c));
  console.log("   -> " + p.date + " | " + (Parse.describe(p)||"(nothing)") + " | type=" + p.type + " | notes=" + JSON.stringify(p.notes));
});
