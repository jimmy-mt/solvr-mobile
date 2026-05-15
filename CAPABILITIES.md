# Solvr — App Capabilities

Solvr is a poker training and analysis app built for players who want to study GTO (Game Theory Optimal) strategy on mobile. It combines interactive hand training, preflop range exploration, an AI-powered poker simulator, and detailed performance analytics — all in one place.

---

## Navigation

The app is organized into five tabs accessible from a persistent bottom navigation bar:

- **Home** — Dashboard with stats, quick tools, and session history
- **Train** — Interactive hand-by-hand training mode
- **Simulator** — AI-powered full hand simulator
- **Ranges** — Preflop range explorer / decision tree
- **Profile** — Subscription management

---

## Home

The home screen is your hub for tracking progress and accessing tools.

### Daily Streak
- A fire icon and progress bar track how many hands you've trained today toward a daily 10-hand goal.
- Tapping the streak indicator opens a modal showing your current streak count and daily progress.

### Quick-Access Cards
Three cards provide shortcuts to key features directly from the dashboard:

- **Training Breakdown** — A miniature poker table visualization showing your performance score for each seat position, color-coded from red (low) to green (high).
- **Equity Calculator** — A shortcut into the built-in equity tool.
- **Sessions** — A preview of your aggregate stats: total sessions, hands trained, and overall Solvr score.

### Start Training
A large button at the bottom of the home screen launches a training session immediately.

---

## Analytics (from Home → Training Breakdown)

A full-screen analytics view with detailed performance breakdowns.

### Position Table
- A circular poker table with 6 seats, each color-coded by your performance at that position.
- Tapping a seat opens a popover showing:
  - **Solvr Score** (0–100)
  - **Accuracy** (% of hands answered correctly)
  - **Hands Trained** at that position
  - **Breakdown by spot type**: RFI, VS Open, VS 3Bet, VS 4Bet

### Metric Toggle
Switch the table view between **Solvr Score** and **Accuracy**.

### Filters
An expandable filter panel lets you narrow analytics by:
- **Time window**: 7 Days, 30 Days, All Time
- **Spot type**: All, RFI, VS Open, VS 3Bet, VS 4Bet
- **Position**: All, UTG, HJ, CO, BTN, SB, BB

### Spot Cards
A 2-column grid of cards — one per spot type — each showing your color-coded score for that spot category.

---

## Equity Calculator (from Home → Equity Calculator)

A head-up equity tool for calculating win probabilities between two hands.

- **Hand Input**: Two hand slots (hero and villain), each holding 2 cards.
- **Card Picker**: Select cards by choosing a rank (A through 2) and a suit (♠ ♥ ♦ ♣). Already-selected cards are grayed out to prevent duplicates.
- **Quick Actions**:
  - **Random** — Fills both hands with random valid cards.
  - **Clear** — Resets all selections.
- **Calculate** — Runs the equity simulation and shows a result card with:
  - A stacked bar chart split into Win (green) / Tie (gold) / Lose (red) segments
  - Win%, Tie%, and Lose% percentages
  - The number of simulations run
- **Help** — An info button opens a modal explaining how equity is calculated.

---

## Sessions (from Home → Sessions)

A log of all your past training sessions.

- **Session List** — Cards showing date, filters used, number of hands, accuracy, and Solvr score.
- **Session Detail** — Drill into any session to see full metrics plus a hand-by-hand log:
  - Hand class and context (position, spot type)
  - Action you chose vs. the solver's recommendation
  - The frequency of your chosen action in the solution
  - A result pill: **Right** or **Miss**, with the score earned

---

## Trainer

The core training mode. You're shown real poker hands and asked to make the correct GTO decision.

### Hand Display
- A full poker table with 6 positions showing which seats have folded or are active.
- Your hole cards are shown with a deal animation.
- The pot size is displayed on the table.

### Answering Hands
Four action buttons appear at the bottom:
- **Fold** (blue)
- **Call** (green)
- **Raise** (red, shows raise amount)
- **All-in** (purple)

Tap one to submit your answer.

### Result Screen
After answering, a full-screen result overlay appears:
- **Correct** (green) or **Wrong** (red)
- Your **Solvr Score** for that hand (0–100), which rewards being close to the correct frequency even if you chose the wrong action
- An animated **frequency bar** showing the solver's actual action frequencies for that hand
- A **range grid** (13×13) showing how the solver plays the full range in that spot, with your hand highlighted
- A **Next Hand** button to continue

### Session Stats Bar
A progress track at the top shows:
- Hands correct / hands total
- Accuracy percentage
- Running Solvr score
- A "New Session" button to reset

### Filters
A slide-up filter panel lets you customize what hands you train:
- **Spot Type**: Any, RFI, Open, 3Bet, 4Bet
- **Position**: Multi-select from UTG, HJ, CO, BTN, SB, BB

### Practice Modes
- **Improve Mode** — Only trains hands you've previously missed. Good for focused drilling on weaknesses.
- **Test Mode** — A structured test set. The session header changes to show "End Test" when active. Progress bar turns teal.

### Hint Panel
Tapping the info (i) button opens a hint overlay showing:
- The name of the range you're in (e.g., "UTG RFI Range")
- A full 13×13 range grid for that spot
- A color legend explaining action frequencies
- The scenario context in the subtitle

---

## Ranges

An interactive preflop range explorer that lets you navigate a decision tree hand-by-hand.

### Position Pills
Six pills at the top show all 6 seats. Each pill updates its state as you navigate:
- **Hero** (purple) — your position
- **Raised** (red tint) — a player who has raised
- **Folded** (gray) — eliminated from the hand
- **Pending** (faded purple) — yet to act
- **Inactive** (very faded) — not in the hand

### Scenario Label
A label box below the pills describes the current spot in plain language (e.g., "UTG RFI", "HJ vs UTG Open").

### Range Grid
A 13×13 grid covers every possible starting hand (AAs to 72o). Each cell:
- Shows stacked color segments representing how often the solver takes each action
- Can be tapped to select that hand and see its individual frequency breakdown
- Dims if the hand is not reachable in the current spot

### Cell Detail Panel
When you tap a hand:
- The hand name appears
- An animated frequency bar slides in showing action percentages
- A legend labels each segment (Fold, Call, Raise, All-in) with its percentage

### Action Buttons
Buttons at the bottom let you navigate the decision tree:
- **Fold**, **Call**, **Raise** (with amount), **All-in**
- Only available actions for the current node are enabled
- Tapping an action advances the tree to the next decision point

### Navigation Controls
- **Back** — Returns to the previous node in the tree
- **Reset** — Jumps back to the root of the tree
- Navigation is cached, so revisiting nodes is instant

### End of Hand State
When the action reaches a terminal node (fold, call, or all-in resolved), a banner appears explaining that postflop content is coming soon.

---

## Simulator

An AI-powered poker simulator where you play against a machine learning model.

### Hand Setup
- **New Hand** — Deals a fresh hand with all 6 positions
- **Next** — Advances the action for non-hero positions using the ML model

### Table Display
A blue-themed poker table shows:
- All 6 positions with their hole cards
- Your hero position highlighted
- Folded and active indicators
- Pot size and raise/blind amounts

### Hero Action Panel
When it's your turn, four buttons appear:
- **Fold**, **Call**, **Raise**, **Jam**
- A label shows the current amount to call or game state
- Buttons are disabled when it's not your turn or the model is loading

### Model Frequency Output
A panel labeled "Hero NN Output" shows the model's recommended action probabilities for your current situation — Fold / Call / Raise / Jam percentages displayed as frequency bars.

### Seat-by-Seat Grid
A 6-card grid shows all seats with:
- The action taken by the model for each position
- Compact frequency breakdown (F / C / R / J percentages)
- Hero seat highlighted in purple

### Action Log
The 8 most recent actions are shown in a scrolling log, each line showing the position, action taken, and pot size after the action.

### Status Panel
Three status metrics are always visible:
- Current pot size (in big blinds)
- Your hole cards
- Model status: Loading / Ready / Rebuild

---

## Profile

### Subscription Status
Shows your current plan (Free or Solvr Pro) with a description of what it includes.

### Solvr Pro
A card presenting the premium tier with:
- **Unlimited trainer hands** — No daily cap (Live)
- **Hand analysis** — Coming soon
- **Simulator hands** — Coming soon
- **Leak tracking** — Coming soon

Each benefit shows a status badge indicating whether it's live or upcoming.

### Subscribe Button
A large CTA button to subscribe to Solvr Pro.

---

## Scoring

### Solvr Score (0–100)
The Solvr Score rewards strategic accuracy rather than just binary right/wrong. It measures how close your chosen action was to the solver's recommended frequency. Choosing a mixed-strategy action at its correct frequency scores near 100; choosing a dominated action scores near 0.

### Accuracy
The simpler metric — the percentage of hands where you chose the solver's highest-frequency action.

Both metrics are tracked per session and in aggregate, broken down by position and spot type.
