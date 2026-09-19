# Source fidelity checklist

What the drawings actually show, room by room, item by item. This file is
the CONTRACT: the model is built to match this, and where the model and
this list disagree, the model is wrong.

It exists because the first build got this badly wrong. The clearance
checker was allowed to move furniture until the routes came out green,
items were invented that appear on no drawing, and several doors were
relocated on my own judgement. That is backwards. **The drawings decide
the layout. The checker only reports.** A door that opens onto a
wardrobe, a room you cannot cross - those get REPORTED, in the Survey
view and in the geometry gate, and the drawing is left alone.

Three sources, and each is authoritative for different things:

| Source | Authoritative for |
|---|---|
| Agent's floor plan | The as-bought shell: room clear sizes, wall positions, window and door positions, stair, fireplaces, sanitaryware |
| Design study | The post-extension layout: rooms, walls, doors, windows, and EVERY piece of furniture drawn on it |
| Listing photograph | External elevation only: window count, chimney positions, porch, roof form |

Every line was re-read off the source at 7x to 18x magnification, and the
wall and opening positions were measured by scanning the pixels rather
than eyeballed. `[x]` means the model matches the drawing.

---

## Stage: as bought

The agent's plan shows **no loose furniture** - it is an unfurnished
EPC-style drawing. The only fittings on it are the kitchen's sink run and
worktop and the bathroom's sanitaryware. So this stage has an empty
variant and a fittings-only one. The "moving in" variant of the first
build was entirely invented and has been deleted.

### Ground floor

**Shell**
- [x] Rear wing (kitchen) roughly CENTRED on the width, set in from both
      gables. Scaling the plan puts its centre 73mm east of the house's;
      the model centres it and records the residual.
- [x] Hall clear width 0.87m, the residual of `0.23 + 3.26 + 0.13 + hall
      + 0.13 + 3.35 + 0.23 = 8.20`. Scaling the plan gives 0.886.
- [x] The hall runs the FULL depth as one corridor, from the front door
      past the stair to the kitchen door in the old rear wall. The plan
      colours its north half as kitchen and its south half as hallway;
      they are one space between the same two walls.
- [x] The stair sits in that corridor and rises NORTH.

**Kitchen** (3.01 x 3.14)
- [x] Sink unit with drainer against the EAST wall.
- [x] One worktop unit in the north wall, west of the window.
- [x] Window in the NORTH wall.
- [x] Window in the EAST wall.
- [x] Back door in the EAST wall, below that window, opening into the
      kitchen.
- [x] Door at the south end, off the head of the hall, hinged west.
- [x] A SECOND way in: a cased opening, no leaf drawn, straight from the
      lounge's north-west corner. The first build missed this entirely.
- [x] NO window in the west wall. (The first build invented one.)

**Dining room** (3.26 x 3.89)
- [x] Chimney breast on the WEST (gable) wall, 1.44m long, projecting
      0.45m. (The first build drew it 0.80 x 0.33.)
- [x] Window in the SOUTH wall.
- [x] Door off the hall, at the FRONT (south) end, hinged at its north
      jamb.
- [x] NO north window, NO west window. (The first build invented both.)
- [x] No furniture.

**Lounge** (3.35 x 3.87)
- [x] Chimney breast on the EAST (gable) wall, same size, mirrored.
- [x] Window in the SOUTH wall.
- [x] Door off the hall, at the FRONT (south) end.
- [x] Cased opening into the kitchen at its north-west corner.
- [x] NO north window, NO east window. (The first build invented both.)
- [x] No furniture.

**Hallway**
- [x] Front door in the SOUTH wall, hinged west, opening in.
- [x] Doors to dining room and lounge, both at the front end.

### First floor

**Landing**
- [x] A small landing at the HEAD of the stair with three doors off it:
      bedroom 1 (west), bedroom 2 (east), bathroom (north). The plan
      splays the corners at 45 degrees to fit them; the model is
      orthogonal, so the doors sit at the north end of each wall.
- [x] The stairwell void stops short of the front wall.

**Bedroom 1** (3.33 x 3.91)
- [x] L-shaped: it takes in the floor over the FOOT of the flight, east
      of its own wall, which bedroom 2 does not. (The first build drew it
      as a plain rectangle.)
- [x] Chimney breast on the WEST wall.
- [x] Window in the SOUTH wall.

**Bedroom 2** (3.34 x 3.87)
- [x] Chimney breast on the EAST wall.
- [x] Window in the SOUTH wall.
- [x] Its west wall runs the full depth - no L.

**Bathroom** (2.97 x 3.13, over the kitchen)
- [x] WC at the NORTH-WEST, against the north wall.
- [x] Basin on the NORTH wall, centre.
- [x] Bath against the EAST wall, running north-south.
- [x] Window in the EAST wall. (The first build put it in the north.)
- [x] NO window in the north wall.
- [x] Door in the SOUTH wall, off the landing, hinged east.

**Front elevation**
- [x] Three first-floor windows and two ground-floor windows either side
      of the porch, as the photograph shows. The third first-floor window
      lights bedroom 1's L-foot over the stair.

---

## Stage: after the extension

Every item below is drawn on the design study. Nothing else belongs in
this stage's furnished variant.

Two things the study draws are worth naming, because they look like
mistakes in the model and are not:

- **The hall is a dead end.** The study draws no opening at all between
  the hall and the kitchen-diner. The only route from the front door to
  the back of the house is through the living room.
- **The WC is about one square metre.** That is what makes the boot
  room's stated 5 square metres work. It is modelled as drawn, and the
  Survey view reports that you cannot get across it.

### Ground floor

**WC**
- [x] Pan against the NORTH wall at the west, under the window.
- [x] Basin to its east.
- [x] Window in the NORTH wall.
- [x] Door in the WC's south wall, onto the boot room, 0.59m wide.

**Boot room / utility** (approximately 5 m2)
- [x] Back door in the WEST wall, opening east into the room.
- [x] Along the SOUTH edge, west to east: freezer, SINK, WM/TD. (The
      first build read the sink as a washing machine.)
- [x] "bench + coats": a tall narrow unit against the EAST side, running
      most of the room's depth.
- [x] Door in the EAST wall at its south end, onto the kitchen-diner.
- [x] Window in the NORTH wall.
- [x] The "store" cupboard belongs to the SNUG, not here. The first
      build put it in the boot room.

**Kitchen-diner** (stated 18 m2, modelled 16.9)
- [x] Run along the NORTH wall: F/F, worktop, SINK under the window, DW,
      worktop, stopping at the dashed line.
- [x] Run down the WEST side: worktop, HOB (four rings), OVEN.
- [x] Island, 1.6 m, free-standing.
- [x] TWO round stools on the island's SOUTH side.
- [x] The dashed line is NOTIONAL and is not drawn as a wall.
- [x] Dining table toward the east end.
- [x] THREE chairs on the table's WEST side.
- [x] Bench seat against the EAST wall, alongside the table.
- [x] FRENCH DOORS in the NORTH wall at the east end: a pair, each
      hinged at its jamb, both opening inward. NOT a bifold. (The first
      build made them bifold and moved them.)
- [x] Window in the EAST wall, behind the bench.

**Snug** (approximately 13 m2)
- [x] Sideboard against the NORTH wall, west end.
- [x] "store" cupboard on the NORTH wall, beside it.
- [x] Chimney breast on the WEST wall.
- [x] L-SHAPED sofa in the south-west corner, drawn as two arms.
- [x] TWO desks against the EAST wall, one north, one south.
- [x] A chair at each desk, plus a third loose chair near the sideboard.
      Three chairs in total.
- [x] Window in the SOUTH wall.
- [x] Door off the hall at the SOUTH end of the east wall, hinged at its
      south jamb.

**Living room** (approximately 13 m2)
- [x] EMPTY except the stove. No sofa, no armchair, no coffee table, no
      media unit. (The first build invented all four.)
- [x] Chimney breast with stove on the EAST wall.
- [x] Window in the SOUTH wall.
- [x] NO window in the east wall. (The first build invented one.)
- [x] Door off the hall at the SOUTH end of the west wall.
- [x] Door in the NORTH wall at its WEST end, a SINGLE leaf, hinged west,
      opening into the kitchen-diner. (The first build made it a double
      and put it elsewhere.)

**Hall**
- [x] Front door in the SOUTH wall.
- [x] Stair rising NORTH, stairwell walls carried to the front wall.
- [x] Doors to snug and living room, both at the front end.
- [x] NOTHING joining it to the kitchen-diner.

### First floor

**Bedroom 3** (approximately 7 m2)
- [x] Full depth, from the garden wall to the old rear wall.
- [x] Single bed against the WEST wall, head NORTH.
- [x] Window in the WEST wall.
- [x] Window in the NORTH wall.
- [x] Door in its EAST wall, **off the LANDING'S WEST END**, hinged on
      the south jamb and opening back into the bedroom. THE SECOND BUILD
      PUT IT IN THE SOUTH WALL, which is the old rear wall, so it opened
      into BEDROOM 1 - a bedroom you could only reach through another
      bedroom. The owner spotted it. Re-measured on the study at y 2.740
      to 3.433, which is the whole of the landing's west end; the model
      builds thicker walls than the study draws, so that end is 0.575
      clear here and the door is 0.575 with it. Not a buildable door.
      Reported, not corrected - see the landing-is-narrow assumption.
- [x] NO desk, NO wardrobe. (The first build invented both.)

**Bathroom** (approximately 4 m2)
- [x] Bath along the NORTH wall. Only 1.5m fits, and 1.5m is what it is.
- [x] WC on the WEST wall.
- [x] Basin on the WEST wall, below the WC.
- [x] Window in the NORTH wall.
- [x] Door in its SOUTH wall at the EAST end, off the landing, hinged
      west. (The earlier draft of this file said west end; it is east.)

**Office** (approximately 8 m2)
- [x] "bookshelves": fitted, hatched, the full height of the WEST wall.
      A built-in FEATURE, not furniture, and not on the landing. (The
      first build made it a landing bookcase.)
- [x] Sofa bed against the NORTH wall.
- [x] A table in the middle of the room.
- [x] A round chair.
- [x] "PC desk" against the EAST wall, running most of its depth.
- [x] Window in the NORTH wall. The study draws it straddling the join
      between old brickwork and new; it is modelled east of the join and
      the 820mm shift is recorded in the derivation.
- [x] Window in the EAST wall.
- [x] Door in the SOUTH wall at its WEST end, off the landing.
- [x] L-shaped in plan: it wraps west and north of the en-suite.

**En-suite**
- [x] WC against the NORTH wall.
- [x] Basin on the SOUTH wall.
- [x] Shower against the EAST wall.
- [x] Door in the SOUTH wall, **off the MASTER BEDROOM**, hinged on the
      west jamb and opening north into the shower room. The study draws
      the WEST wall solid its whole height between ens-n and the old
      rear wall, and draws the leaf and its arc in the south wall.
      Measured at x 5.75 to 6.43 on the old rear wall, moved 35mm east
      so the west jamb lands on the face of the partition rather than
      35mm behind it. The first build hung it off the master, the second
      moved it to the landing, and the second was wrong: an en-suite you
      reach from the landing is a second bathroom.

**Master bedroom** (approximately 13 m2)
- [x] "fitted wardrobes": hatched, along the NORTH wall at the EAST end.
      A built-in FEATURE, not furniture.
- [x] Bed with its head against the WEST side.
- [x] "bench" to the EAST of the bed.
- [x] Armchair in the SOUTH-EAST corner.
- [x] Chimney breast on the EAST wall.
- [x] Window in the SOUTH wall.
- [x] Door in the NORTH wall, off the stairwell head, hinged west.
- [x] NO bedside tables. (The first build invented two.)

**Bedroom 1** (approximately 13 m2)
- [x] Double bed against the NORTH wall, head NORTH.
- [x] Chimney breast on the WEST wall.
- [x] TWO windows in the SOUTH wall.
- [x] Door in the NORTH wall, off the stairwell head, hinged east.
- [x] NO bedside tables, NO wardrobe. (The first build invented three.)

**Landing**
- [x] An EAST-WEST corridor along the north side of the old rear wall,
      from bedroom 3's wall to the en-suite's, with the bathroom and the
      office off its north side and BEDROOM 3 off its west end.
      (The first build had no such corridor.) Nothing opens off its east
      end: the en-suite is reached from the master.
- [x] 0.575m clear, because it is set out between a 0.13 partition and
      the old rear wall at 0.23. The study draws it about 0.72; it draws
      every wall thinner than this model builds them. Reported.
- [x] Joined to the stairwell head through a cased opening in the old
      rear wall.
- [x] Doors to bedroom 1 and the master either side of that opening,
      both hinged on the stairwell side, both opening south.

---

## The rule this file enforces

The clearance checker and the geometry gate may FAIL a variant and say
why. Neither may move anything. If the drawing puts a door where it hits
a wardrobe, the model shows it hitting the wardrobe and the Survey view
says so - because that is a finding about the design, and quietly fixing
it would hide the one thing worth knowing.

What the gate reports on this model today, and should keep reporting:

- As bought, you cannot get across the hallway: the flight fills it.
- After the extension, you cannot get across the WC, and its door opens
  onto both the pan and the basin.
- The WC and bathroom doors are 0.59m and 0.57m, under any sensible
  minimum.
- The kitchen-diner comes out 16.9 m2 against a stated 18.
- The island's working side is tighter than 0.85m, the dining table is
  closer to the wall than 0.4m, and the office chair stands in the PC
  desk's clear zone.

Every one of those is what the drawing draws.

---

## The plot

Added from the owner's handbook (`48 Ameysford Road - Home Plan, Final
Designs`), which was not among the first four sources. Page 8 draws the
whole plot to scale with its own bar; page 28 and page 35 state the
figures in words.

- [x] Plot 17.60 x 40.00m. Measured on page 8's boundary rectangle at
      904 x 2056 pixels against a scale of 51.4 px/m, which is
      17.59 x 40.00 - the stated figure to within 10mm.
- [x] House 2.70m from the WEST boundary. Stated "about 2 m to the Pine
      Close hedge"; the boundary is outside the hedge.
- [x] 6.61m to the EAST boundary. Stated "5-6 m of garden to the east".
- [x] 26.92m of REAR garden. Stated "approximately 27 m", and "25-28 m"
      on page 27.
- [x] 4.91m of FRONT garden. Stated "approximately 5 m".
- [x] Those four and the footprint sum to the stated plot in BOTH
      directions, so the source drawing is consistent with itself. That
      sum is what `tests/unit/plot.test.mjs` asserts.
- [x] The house is anchored by its WEST and SOUTH faces, which are the
      two a setting-out would work from - the Pine Close hedge and the
      road frontage - so the 280mm depth residual lands in the 27m rear
      garden and not in the 5m front.
- [x] Front faces SOUTH onto Ameysford Road. Pine Close WEST, No. 46
      EAST, garages and then Pine Close homes NORTH. Corner plot.
- [ ] NOT modelled, deliberately: hedge, rough grass, overgrown shrubs,
      planting bed, hardstanding, shrub border, sheds, vehicles, open
      ground, the rear gate. Every one is traced off an aerial to plus
      or minus one to two metres by the source's own admission. The
      owner asked for the boundary and not the surfaces, and the reason
      holds independently: drawing them beside walls measured off a
      floor plan would dress an estimate as a survey.
- [ ] The boundary is a RECTANGLE because page 8 draws it as one and
      labels it "Boundary (approx.)". The aerial on page 27 shows the
      real boundary is not quite square. A title plan settles it.
