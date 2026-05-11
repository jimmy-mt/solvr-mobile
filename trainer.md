# Trainer Tab Reference

This document explains how the Trainer tab works, what data it reads from
`Solvr/trainer.db`, and what user performance data it stores locally in the
browser.

## Overview

The Trainer tab is a preflop quiz. For each hand, Solvr:

1. Chooses a random preflop spot from `trainer.db`, respecting the current filters.
2. Chooses a hand class for that spot, weighted by that hand's reach probability.
3. Shows the table state, hero hand, and legal action buttons.
4. Checks whether the user's selected action has any GTO frequency.
5. Shows the result screen with the hand's GTO frequencies and the full range grid.
6. Stores the decision in browser IndexedDB for stats, streaks, history, and Home tab review.

The trainer is fully client-side. `trainer.db` is loaded into the browser with
`sql.js`; user performance is stored in IndexedDB under the browser profile.

## Main Files

- `Solvr/Solvr.html`
  Contains the React UI and the Trainer tab flow.

- `Solvr/db.js`
  Wraps SQLite queries against `trainer.db`.

- `Solvr/performance.js`
  Stores session and decision history in IndexedDB.

- `Solvr/game.js`
  Provides shared poker helpers such as hand labels, random suit dealing, GTO action selection, and stat updates.

- `Solvr/trainer.db`
  Precomputed preflop strategy tree used by the Trainer and Ranges-style views.

## trainer.db

`trainer.db` is a SQLite database served statically from `Solvr/trainer.db` and loaded in `DBLoader` inside `Solvr.html`.

Current contents:

- `nodes`: 70 rows
- `hands`: 9,163 rows
- `transitions`: 69 rows

Layer counts:

- `0`: RFI, 5 nodes
- `1`: vs open, 15 nodes
- `2`: vs 3-bet, 35 nodes
- `3`: vs 4-bet, 15 nodes

## Table: nodes

Each row in `nodes` is one decision point in the preflop tree.

Important columns:

- `id`
  Primary key used by `hands.node_id` and `transitions`.

- `layer`
  Spot type:
  - `0`: RFI
  - `1`: vs open
  - `2`: vs 3-bet
  - `3`: vs 4-bet

- `opener_sequence`
  Text description of the previous aggressors.
  Examples:
  - `NULL` for RFI
  - `UTG` for facing a UTG open
  - `UTG, HJ` for UTG opened and HJ 3-bet
  - `UTG, HJ, CO` for UTG opened, HJ 3-bet, CO 4-bet

- `hero_position`
  The player whose decision is being trained.

- `<seat>_is_hero`
  Whether a seat is the hero in this node.

- `<seat>_has_acted`
  Whether the seat has already taken a preflop action.

- `<seat>_fold`, `<seat>_call`, `<seat>_raise`
  Encoded action state for each seat.

- `<seat>_invested_bb`
  Amount that seat has committed in big blinds.

- `<seat>_stack_bb`
  Remaining stack in big blinds.

- `proposed_raise_bb`
  The raise size shown on the Trainer `Raise` button.

- `all_in_size_bb`
  The all-in size available in that node.

- `num_active_remaining`
  Number of active players left in the hand after the current context.

The UI converts a `nodes` row into a smaller spot object with `spotFromNode()` in
`db.js`. That object is what the Trainer uses for labels, table highlights, raise
amounts, and filters.

## Table: hands

Each row in `hands` is one 169-grid hand class for one node.

Important columns:

- `node_id`
  Links the hand row to a `nodes.id`.

- `hand`
  Hand class label, such as `AA`, `AKs`, `KQo`.

- `high_rank`, `low_rank`, `suited`
  Structured representation of the hand class.

- `freq_fold`
  Fold frequency from 0 to 100.

- `freq_call`
  Call frequency from 0 to 100.

- `freq_raise`
  Raise frequency from 0 to 100.

- `freq_all_in`
  All-in frequency from 0 to 100.

- `hand_probability`
  Reach probability for this hand in this node. The Trainer uses this as a weight
  when choosing which hand class to quiz. A hand with `hand_probability = 0` is
  treated as impossible/unreached for that spot.

`loadNodeById()` returns these rows as a map:

```js
{
  "AKs": {
    fold_freq: 0,
    call_freq: 0,
    raise_freq: 100,
    all_in_freq: 0,
    hand_probability: 100,
    possible: true,
    reach: 100
  }
}
```

## Table: transitions

`transitions` connects one node to another after an action:

- `from_node_id`
- `action`
- `to_node_id`

Current action values are:

- `fold`
- `raise`

The Trainer tab itself mostly quizzes single-node decisions. The transition table is used more directly by browsing/walking range trees elsewhere in the app.

## Loading Flow

When the app starts:

1. `DBLoader` in `Solvr.html` loads `trainer.db` via `fetch()`.
2. `sql.js` opens the database in memory.
3. `window.initDB(db)` stores the SQLite handle in `db.js`.
4. `Performance.init()` opens the browser IndexedDB performance database.
5. The app marks the DB as ready and renders the tabs.

No backend API is needed for the Trainer tab.

## How a Trainer Hand Is Chosen

The Trainer uses `pickRandomSpot()` in `Solvr.html`.

1. Convert the spot filter into layers:
   - `RFI` -> layer `0`
   - `VO` -> layer `1`
   - `V3B` -> layer `2`
   - `V4B` -> layer `3`
   - `ANY` -> all layers

2. Apply the position filter:
   - If no position is selected, all positions are eligible.
   - Otherwise, only selected hero positions are eligible.

3. For each eligible layer and position, call:

```js
getNodeIds([layer], [position])
```

4. Randomly choose:
   - one layer bucket
   - one position bucket
   - one node id inside that bucket

5. Load the node:

```js
loadNodeById(nodeId)
```

6. Convert the node row into a Trainer spot:

```js
spotFromNode(data.node)
```

7. Choose a hand class from the node's hand map with:

```js
pickWeightedHand(handsForPick)
```

The hand picker is weighted by `hand_probability`, so unreached or rare hands appear less often.

## How the Quiz Is Scored

When the user presses an action button, `pick(action)` runs.

For the current hand class, the Trainer reads:

- `raiseFreq`
- `allInFreq`
- `callFreq`
- `foldFreq`

The selected action is marked correct if that action has a non-zero GTO frequency:

```js
Raise  -> raiseFreq > 0
All-in -> allInFreq > 0
Call   -> callFreq > 0
Fold   -> foldFreq > 0
```

This means the trainer accepts mixed-strategy actions. If GTO mixes 30% raise and
70% fold, both `Raise` and `Fold` count as correct.

The displayed "best" GTO action is the action with the highest frequency, with
all-in considered if it is present and highest.

## Result Screen

After answering, the Trainer changes from `quiz` phase to `result` phase.

The result screen shows:

- Correct/Wrong
- Frequency breakdown for the current hand
- The full 13x13 range grid for the current node
- The current hand highlighted in the grid
- Session counters: correct, hands, accuracy
- Next Hand button

The range grid uses `RangeGridAction`, where each cell is rendered as colored action segments:

- red: raise
- dark red: all-in
- green: call
- blue: fold
- dark/unreached portion: unavailable or reduced reach

## Filters

The Trainer has two filter groups:

- Spot type:
  - Any
  - RFI
  - VS Open
  - VS 3Bet
  - VS 4Bet

- Position:
  - Positions allowed for the current spot type
  - Empty selection means all positions

- Wrong Hands:
  - Separate practice mode for hands the user previously answered wrong
  - Ignores spot type and position filters while active
  - Shows the current number of stored wrong hands in the Trainer header

Changing filters:

1. Updates the filter state.
2. Deals a new hand from the filtered node pool.
3. Does not immediately reset the performance session.

If the user answers a hand while the current filters differ from the active
session's filters, Solvr ends the old session, starts a new session with the new
filters, and saves that answered hand into the new session. This avoids creating
short throwaway sessions while the user is only browsing filters.

The active filters are also saved in `localStorage` as part of the Trainer UI
snapshot, so reloading the app restores the filters the user was looking at.

Wrong Hands mode is stored as its own trainer mode. When active, the session
filter is saved as `spotTypeFilter: WRONG` and `positionFilter: ALL`, so review
practice does not mix into normal filtered sessions.

## Trainer UI Snapshot

The current Trainer screen state is saved in browser `localStorage` under:

```text
solvr_trainer_state_v1
```

This snapshot stores:

- `spotTypeFilter`
- `posFilter`
- `phase`
- `spot`
- `hand`
- `cards`
- `picked`
- `stats`
- `handKey`
- `wrongPracticeMode`

This is what keeps the current hand on screen when the user switches tabs,
reloads the app, or closes and reopens the browser. It prevents users from
cycling tabs or refreshing to get a new hand without answering the current one.

The snapshot is UI state only. Answered-hand history still lives in IndexedDB.

## Session Data Stored in IndexedDB

Performance tracking is stored in browser IndexedDB by `Solvr/performance.js`.

Database name:

```text
solvr_performance
```

Version:

```text
2
```

Object stores:

- `sessions`
- `decisions`
- `daily_activity`
- `wrong_hands`

This data is local to the browser and device. It is not written back into
`trainer.db`.

## Object Store: sessions

One row per training session.

Fields:

- `id`
  Auto-increment primary key.

- `started_at`
  Timestamp in milliseconds.

- `ended_at`
  Timestamp in milliseconds, or `null`.

- `spot_type_filter`
  Filter active when the session started.

- `position_filter`
  Position filter active when the session started.

- `total_hands`
  Number of answered hands in the session.

- `correct_hands`
  Number of correct answers.

- `accuracy`
  Rounded percentage.

Sessions are maintained across tab switches and app reloads. On load, the
Trainer asks IndexedDB for the latest open session (`ended_at = null`) and
resumes it if one exists.

A session is created only when needed:

- the user answers a hand and no active session exists
- the user answers a hand under filters that differ from the active session
- the user explicitly presses New Session

Pressing New Session immediately ends the old session, starts a new one with the
current filters, and resets the visible in-tab counter.

## Object Store: decisions

One row per answered hand.

Fields:

- `id`
  Auto-increment primary key.

- `session_id`
  Links to `sessions.id`.

- `timestamp`
  Answer timestamp in milliseconds.

- `spot_type`
  `RFI`, `VO`, `V3B`, or `V4B`.

- `hero_position`
  Hero seat.

- `opener_position`
  Stored as the relevant opponent/aggressor context for the spot.

- `hand_class`
  Hand class shown to the user, such as `AA`, `Q9s`, `KJo`.

- `action_taken`
  User-selected action.

- `was_correct`
  `1` if the selected action had non-zero GTO frequency, otherwise `0`.

- `gto_fold`
- `gto_call`
- `gto_raise`
- `gto_all_in`
  Frequencies saved at answer time.

These rows power Home tab session history, recent decisions, leak summaries, and
charts.

## Object Store: daily_activity

One row per date.

Fields:

- `date_str`
  Local date string in `YYYY-MM-DD` format.

- `hands_played`
  Number of trainer hands answered that day.

- `streak_earned`
  `1` when `hands_played >= 20`, otherwise `0`.

The Home tab uses this to display daily activity and streak progress.

## Object Store: wrong_hands

One row per currently missed hand that should be reviewed.

Fields:

- `key`
  Primary key in the form `node_id|hand_class`. This keeps only one review row
  per exact trainer spot and hand class.

- `timestamp`
  Last time this wrong hand was added or refreshed.

- `node_id`
  Trainer tree node where the mistake happened.

- `hand_class`
  Hand class shown to the user, such as `AA`, `Q9s`, `KJo`.

- `spot`
  Snapshot of the spot descriptor needed to re-display the table context.

When the user answers a normal trainer hand incorrectly, Solvr writes or
refreshes that row. The store keeps only the 100 most recent wrong hands. In
Wrong Hands mode, answering the hand correctly removes it from the store;
answering it wrong leaves it in the store.

## Important Implementation Details

- The Trainer deals concrete suits for display with `dealSuits(label)`, but the
  strategy lookup is by hand class (`AA`, `AKs`, `KQo`), not exact card combo.

- The current quiz state is held in React state while the app is running:
  - `phase`
  - `spot`
  - `hand`
  - `cards`
  - `spotData`
  - `picked`
  - `stats`
  - `sessionId`
  - `sessionFilters`
  - `wrongPracticeMode`

- The current Trainer screen is mirrored to `localStorage` so it can be restored
  across reloads.

- The short in-tab counter (`stats`) is restored from the active session on load.
  It resets when the user explicitly starts a new session, or when the user
  answers the first hand under changed filters and Solvr creates that new
  filter-specific session.

- Long-term performance is persisted in IndexedDB through `Performance.saveDecision()`.

- `trainer.db` is read-only at runtime. It is not modified by training.

## Data Ownership

There are two separate data sources:

1. Strategy data
   - File: `Solvr/trainer.db`
   - Type: SQLite
   - Loaded via `sql.js`
   - Read-only in the app
   - Contains nodes, hand frequencies, transitions

2. User performance data
   - Location: browser IndexedDB
   - Database: `solvr_performance`
   - Written by `performance.js`
   - Contains sessions, decisions, daily activity, and the wrong-hand review set

Deleting browser site data will remove user stats but will not affect
`trainer.db`.
