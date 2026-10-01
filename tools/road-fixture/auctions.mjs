// road-fixture/auctions.mjs - the demo's auctions: invented houses, their
// dates (one moved, as auctioneers move them), what lots went for, and a
// playbook. Part of tools/build-road-fixture.mjs; nothing here is real.

/**
 * @param {{HOUSES:Object<string,string>, INVENTED:string}} at the invented auction houses, and the source line
 */
export function auctionParts({ HOUSES, INVENTED }) {
  const HOUSE_FACTS = {
    FBK: ['Online, timed', 'Houses across the demo county', 'About monthly', 'The most lots of the right kind'],
    CLV: ['In the room and online', 'Cottages and land', 'Every six weeks or so', 'Fewer bidders in the room'],
    BRH: ['Online, live', 'Larger and listed houses', 'Quarterly', 'Where the over-budget houses turn up'],
  };
  const houses = Object.entries(HOUSES).map(([code, name]) => {
    const [format, covers, cadence, why] = HOUSE_FACTS[code];
    return { code, name, format, covers, cadence, link: `https://example.org/demo/${code.toLowerCase()}`, why };
  });
  const date = (code, kind, on, checked, title = null, status = 'scheduled', notes = null) =>
    ({ house_code: code, kind, on_date: on, title, notes, checked_on: checked, status });
  const calendar = [
    date('BRH', 'catalogue', '2026-09-24', '2026-09-22'),
    date('FBK', 'catalogue', '2026-09-30', '2026-09-28'),
    date('BRH', 'auction', '2026-10-15', '2026-09-28'),
    date('CLV', 'catalogue', '2026-10-15', '2026-09-28'),
    date('FBK', 'auction', '2026-10-21', '2026-09-28'),
    date('CLV', 'auction', '2026-11-05', '2026-09-28'),
    date('FBK', 'catalogue', '2026-11-11', '2026-09-28'),
    date('FBK', 'bidding_opens', '2026-11-25', '2026-09-28', 'Timed sale opens'),
    date('FBK', 'auction', '2026-12-02', '2026-09-28', null, 'moved', 'Moved from 25 November'),
    date('CLV', 'auction', '2026-12-17', '2026-09-28'),
  ];
  const results = [
    { house_code: 'FBK', listing_code: null, sold_on: '2026-07-15', lot: '4', property_type: '3-bed semi, tired',
      guide: 240000, sold: 291000, outcome: 'sold', lesson: 'A low guide drew a crowd: it went 21% over', source: INVENTED },
    { house_code: 'CLV', listing_code: null, sold_on: '2026-08-20', lot: '2', property_type: '2-bed cottage',
      guide: 180000, sold: 196000, outcome: 'sold', lesson: null, source: INVENTED },
    { house_code: 'BRH', listing_code: null, sold_on: '2026-06-10', lot: '9', property_type: '5-bed listed house',
      guide: 300000, sold: null, outcome: 'unsold', lesson: 'Unsold in the room; offers after', source: INVENTED },
  ];
  const play = (code, kind, body, sort_order) => ({ code, kind, body, sort_order });
  const playbook = [
    play('PB-1', 'setup', 'Register with each house before the catalogue is out.', 10),
    play('PB-2', 'daily', 'Check the new lots against the rules before anything else.', 20),
    play('PB-3', 'weekly', 'Re-check every tracked date: houses move them.', 30),
    play('PB-4', 'rule', 'Fix the maximum bid at the go or no-go step, and do not move it in the room.', 40),
    play('PB-5', 'did_not_work', 'Viewing before reading the legal pack wasted a morning.', 50),
  ];
  return { houses, calendar, results, playbook };
}
