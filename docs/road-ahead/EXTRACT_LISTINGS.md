# Extracting listings with Claude chat

When this environment cannot reach Rightmove or another portal, a Claude
chat session with web access reads the listings and returns them as
JSON, and Claude Code assesses each one by `ASSESS_PROPERTY.md` (R-06).
The chat session records facts only. Every estimate - the likely price,
the works, the finished value, the profit - is Claude Code's, under the
protocol.

## The prompt

Claude fills in `<HOME>` (the owner's home, from the conversation; it
never enters this repository), `<TODAY>` and the links, each with the
owner's own words beside it in brackets, and gives the owner the result
to paste into a new chat.

```text
I'm screening houses for a renovate-and-sell plan. For each Rightmove link at the end, open the page and record what it says. Facts only: copy wording exactly, put null for anything not shown, and don't estimate values, works costs or profit (another session does that). If a page won't open, mark it "could not open" and carry on.

Home, for drive times: <HOME>
Today: <TODAY>

For each listing, also find up to 4 real sold prices nearby that show what it could be worth once renovated: the same kind of house (detached, semi or bungalow), bedrooms within one, the same street or within about half a mile, sold in the last 3 years, renovated or modernised ones first. Only use sales you can see on a page, with its link. Skip sold prices for a flat, a mid-terrace, a new-build or anything under 3 bedrooms, and say why in "skipped".

Reply with JSON only, in one code block, in exactly this shape. If it would be too long, stop after a complete listing, write MORE after the code block, and continue in the same shape when I say "continue".

{
  "format": "road-ahead-listings/1",
  "extracted_on": "<TODAY>",
  "part": 1,
  "listings": [
    {
      "link": "",
      "on_portal": "for sale | under offer | sold STC | removed | could not open",
      "address": "",
      "postcode": "",
      "price": 0,
      "price_text": "as written, e.g. Guide price, Offers over",
      "sale_method": "private | auction | modern method of auction",
      "auction": { "auctioneer": "", "date": "YYYY-MM-DD", "lot": "", "buyer_fees": "as written" },
      "added_on": "YYYY-MM-DD",
      "reductions": [{ "date": "YYYY-MM-DD", "from": 0, "to": 0 }],
      "type": "as written, e.g. 3 bedroom semi-detached house",
      "bedrooms": 0,
      "bathrooms": 0,
      "receptions": 0,
      "floor_area_sqft": 0,
      "plot": "as written",
      "tenure": "",
      "council_tax": "",
      "epc": "",
      "heating": "",
      "parking": "",
      "chain": "",
      "condition": ["the exact phrases about condition and work needed"],
      "rooms": ["room: size, from the floor plan or the description"],
      "features": ["the key features, as written"],
      "description": "the parts about condition, layout, plot and potential, as written, up to 200 words",
      "nearby": ["anything the page mentions nearby that could affect value: a main road, railway, industrial units, a building site"],
      "agent": "",
      "drive_minutes": { "minutes": 0, "how": "route planner | estimate" },
      "my_note": "my note beside the link, as written, or null",
      "sold_nearby": [
        { "address": "", "price": 0, "date": "YYYY-MM-DD", "type": "", "bedrooms": 0, "condition": "renovated | average | needs work | unknown", "link": "" }
      ],
      "skipped": null,
      "missing": ["anything you could not find"]
    }
  ]
}

"auction" is null unless it is an auction or a modern method of auction.

Links (my notes in brackets):
<LINKS>
```

## Taking the JSON in

1. **Check it.** The format is `road-ahead-listings/1` and every link
   asked for is there; a part ending MORE waits for the rest.
2. **Search before adding** (`ASSESS_PROPERTY.md`, step 2), by the link,
   then the postcode and the street.
3. **The hard rules first** (step 3): a flat, a mid-terrace or a
   new-build is written `dropped`, its rule as the reason, and named in
   one line of the answer.
4. **The facts go on the listing.** Each `sold_nearby` row is a
   comparable (`kind` 'sold', its link the source, its date the sale's);
   `my_note` is the owner's words, a signal.
5. **Then steps 4 to 8** as for any listing: the inputs with their
   labels, the numbers, the appraisal, the answer, the owner's reaction.
   Each listing is judged against its type, its class and its road,
   profit first, and a short stay in a house that is less than optimal
   (S-59).

A fact read from the listing is VERIFIED, dated `extracted_on` and
sourced to its link; `drive_minutes` is VERIFIED from a route planner,
else ESTIMATE; a sold price with a date and a link is VERIFIED.
