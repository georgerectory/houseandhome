// marketplace.js - buying second hand: is it good, is it cheap, and
// what to look for next.
//
// A thin re-export. The rules live in two modules so neither outgrows
// a screenful of scrolling:
//
//   marketplace/judge.js  one listing: the band, the grade, the guard,
//                         the trip, the offer and the message.
//   marketplace/hunt.js   the whole campaign: the board, the queue, the
//                         alert ration, the sweeps, the money and what
//                         the prices seen so far imply.
//
// Pure: data in, values out. No DOM, no fetch, no clock except what is
// passed in. The band, the grade, the guard and the queue order have a
// second home in SQL (95_ and 96_marketplace_*.sql), and
// tools/parity-marketplace.mjs holds the two equal.
export * from './marketplace/judge.js';
export * from './marketplace/hunt.js';
