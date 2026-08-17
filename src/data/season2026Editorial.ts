export type TransactionTone = "sharp" | "volatile" | "conservative" | "aggressive";

export interface Season2026OwnerEditorial {
  ownerName: string;
  slug: string;
  verdict: string;
  tone: TransactionTone;
  thesis: string;
  titleCase: string;
  collapseCase: string;
  managerPattern: string;
  transactionPrediction: string;
  signatureMove: string;
  cautionaryMove: string;
  waiverWin: string;
  transactions2025: {
    completed: number;
    waivers: number;
    freeAgents: number;
    trades: number;
  };
}

const dossiers: Season2026OwnerEditorial[] = [
  {
    ownerName: "Roy Lee",
    slug: "roy-lee",
    verdict: "Calculated contender",
    tone: "sharp",
    thesis: "The league's best running-back value and a deep, usable weekly lineup give FantasyGPT the cleanest floor in the field. The receiver room is not empty, but it is the one place where an injury or slow start could turn a favorite into merely a good team.",
    titleCase: "Bijan Robinson and Christian McCaffrey create the league's largest non-replaceable weekly edge, while Caleb Williams and Joe Burrow keep both quarterback slots stable. One reliable WR2 addition would remove the only obvious soft spot.",
    collapseCase: "The roster is old and expensive at the very top of the running-back room. If McCaffrey misses time and the middle-class receivers stay middle class, the dominant median projection becomes vulnerable to normal matchup variance.",
    managerPattern: "Roy worked the 2025 wire constantly without trading just to make noise. His best results came from modest bids and patience—Trevor Lawrence for $1 and Hunter Henry for $6—rather than a weekly blockbuster habit.",
    transactionPrediction: "Expect a measured receiver hunt. Roy is more likely to win a boring $3–$7 waiver claim or buy a dependable veteran after a cold week than to detonate the roster. The forecast is one good pickup and one playoff-focused WR trade.",
    signatureMove: "Acquired Matthew Stafford, DeVonta Smith and George Pickens in a Week 9 package that consolidated quarterback stability and receiver depth.",
    cautionaryMove: "Moved A.J. Brown and Blake Corum for Alvin Kamara and Tyler Allgeier in Week 5—a bet whose margin depended heavily on timing.",
    waiverWin: "Trevor Lawrence for $1 in Week 5; 300.2 provider points followed the claim.",
    transactions2025: { completed: 79, waivers: 29, freeAgents: 47, trades: 3 },
  },
  {
    ownerName: "Carl Marvin",
    slug: "carl-marvin",
    verdict: "Value hunter",
    tone: "conservative",
    thesis: "Three Rings is built like a Carl roster: deep, balanced at the premium pass-catching positions and full of players who can outperform their auction prices. The catch is structural—this is the league's No. 1 receiver room attached to its No. 8 running-back projection.",
    titleCase: "Jaxon Smith-Njigba, Drake London, Rashee Rice, Luther Burden and Trey McBride make weekly lineup misses survivable. If Ashton Jeanty or Jeremiyah Love becomes a true RB1, Carl has championship shape.",
    collapseCase: "A weak running-back week can erase every advantage created by the receiver depth, and three preseason injury flags reduce the margin for error. Paying for another running back could also thin the exact depth that makes the roster special.",
    managerPattern: "Carl is selective by league standards, but his 2025 ledger was efficient. He found Stefon Diggs for $6, Jauan Jennings for free and Kenny Gainwell for $1, then used four trades to reshape the top of the roster.",
    transactionPrediction: "Carl will wait for the league to reveal the first distressed running back, then offer from his receiver surplus. The most likely outcome is a sensible two-for-one, not a stupid trade; the danger is waiting one week too long because the roster already looks deep.",
    signatureMove: "Bought Jalen Hurts and Saquon Barkley in Week 4, accepting a large four-player outgoing package to raise the weekly ceiling.",
    cautionaryMove: "The Week 2 J.J. McCarthy-for-Austin Ekeler-and-FAAB deal was a low-return swing, even if the cost was contained.",
    waiverWin: "Stefon Diggs for $6 in Week 4; 160.1 provider points followed.",
    transactions2025: { completed: 46, waivers: 16, freeAgents: 24, trades: 4 },
  },
  {
    ownerName: "Jared Duncan",
    slug: "jared-duncan",
    verdict: "Pressure-point trader",
    tone: "volatile",
    thesis: "Team Duncan has elite quarterback depth, CeeDee Lamb, Tee Higgins and the league's most valuable tight-end room. The lineup-value model is less convinced by the total roster because running back ranks seventh and too much surplus is trapped behind weekly slot limits.",
    titleCase: "Dak Prescott, Bo Nix and Justin Herbert make quarterback injury nearly irrelevant, while Lamb, Higgins and Bowers can win the receiving slots. One dependable running back changes the playoff math immediately.",
    collapseCase: "The No. 7 running-back room leaves too much on Chase Brown and Javonte Williams. If Jared reacts to an early loss by selling a premium receiver at a discount, the cure could cost more points than the weakness.",
    managerPattern: "Jared made four completed trades in 2025 and tended to address clear roster pressure points. The wire work produced Daniel Jones for $6 and useful free depth, while the trades ranged from balanced consolidation to high-variance star sales.",
    transactionPrediction: "A receiver-for-running-back offer is the easiest prediction on the board. Expect Jared to shop Ladd McConkey or the next tier down before touching CeeDee. A good trade is available; an impatient overpay after a 1–2 start is the risk.",
    signatureMove: "Turned Jordan Mason, Aaron Jones and George Pickens into Terry McLaurin, Courtland Sutton and Chase Brown in Week 7.",
    cautionaryMove: "Sent Jahmyr Gibbs for Brian Thomas, Jaylen Waddle and Tyrone Tracy in Week 9—a depth bet that surrendered the best single asset.",
    waiverWin: "Daniel Jones for $6 in Week 2; 209.0 provider points followed.",
    transactions2025: { completed: 66, waivers: 30, freeAgents: 29, trades: 4 },
  },
  {
    ownerName: "Jeff Crossland",
    slug: "jeff-crossland",
    verdict: "Quiet wire assassin",
    tone: "sharp",
    thesis: "Nine-1-1 pairs Puka Nacua and the league's No. 2 receiver value with a deep running-back rotation and a credible two-QB combination. The overall No. 4 power rank keeps Jeff firmly inside the contender tier.",
    titleCase: "Jonathan Taylor, Kenneth Walker and Cam Skattebo keep the flex slots productive, while Puka supplies true week-winning volume. If Tyler Shough is merely stable, this is a difficult roster to outlast.",
    collapseCase: "Tight end ranks eighth and the quarterback room has less proven insulation than the teams above it. A Puka injury would force too many secondary receivers to become primary options at once.",
    managerPattern: "Jeff's 2025 transaction volume was low, but the hit rate on inexpensive quarterbacks was absurd: Matthew Stafford for $0, Sam Darnold for $1 and Aaron Rodgers for $0. He has shown he will trade, but he does not need a trade to stay active.",
    transactionPrediction: "The first move should be tight end, probably through waivers rather than a headline deal. Jeff is the best bet to make an unglamorous pickup that starts for two months. If he trades, expect a bench running back to leave for TE certainty.",
    signatureMove: "Acquired Caleb Williams, Jaylen Warren, Rome Odunze and FAAB in a Week 3 package, spreading risk across three young starters.",
    cautionaryMove: "Sold Sam LaPorta for $12 FAAB in Week 4, a position-thinning decision that would be harder to justify on the current TE-light roster.",
    waiverWin: "Matthew Stafford for $0 in Week 4; 324.6 provider points followed.",
    transactions2025: { completed: 47, waivers: 24, freeAgents: 17, trades: 4 },
  },
  {
    ownerName: "John Downs",
    slug: "john-downs",
    verdict: "Aggressive traditionalist",
    tone: "aggressive",
    thesis: "Dak Shots begins with the league's No. 1 quarterback room in Josh Allen and Patrick Mahomes, plus James Cook, Saquon Barkley and A.J. Brown. The names are stronger than the No. 7 power rank; the model's objection is limited lineup-wide separation beyond the stars and a receiver room that ranks fifth in weekly advantage.",
    titleCase: "Allen and Mahomes can create a weekly advantage before the skill players start. Cook, Barkley, Brown and Olave only need the young receiver bench to produce one useful breakout.",
    collapseCase: "Three injury flags and a thin RB room can force John to start chasing points. The 2025 history shows that this is where he can trade away multiple useful pieces for a single running-back answer that never arrives.",
    managerPattern: "John worked both waiver periods and free agency, landing Quentin Johnston for $7 and Jake Ferguson for $4. His three completed trades were more dangerous: two Week 4 deals exchanged young pass-catchers for J.K. Dobbins and Nick Chubb.",
    transactionPrediction: "John will pursue a running back early and will use the crowded receiver room as currency. One waiver pickup should help, but the model also predicts the league's clearest sell-low risk: a two-for-one that looks decisive and ages badly.",
    signatureMove: "The late Week 14 package for Breece Hall and C.J. Stroud was at least aimed at premium positional volume before the postseason.",
    cautionaryMove: "Moved Quentin Johnston and Travis Hunter for Nick Chubb in Week 4; the outgoing side produced far more from that point.",
    waiverWin: "Quentin Johnston for $7 in Week 1; 149.7 provider points followed.",
    transactions2025: { completed: 53, waivers: 20, freeAgents: 30, trades: 3 },
  },
  {
    ownerName: "Edward Saad",
    slug: "edward-saad",
    verdict: "Blockbuster volatility",
    tone: "volatile",
    thesis: "Feels Different This Year has championship-level pillars in Jalen Hurts, Jaxson Dart, Jahmyr Gibbs and Amon-Ra St. Brown. The No. 3 power rank and 10–4 median path reflect real starting-lineup value; five injury flags and a seventh-ranked tight-end room keep the range wide.",
    titleCase: "If Hurts and Dart finish as projected and Gibbs plus Amon-Ra remain healthy, no opponent gets an easy quarterback or flex advantage. Edward has enough upside receivers to discover a fifth starter during the year.",
    collapseCase: "The roster can become top-heavy fast, and the 2025 ledger shows a willingness to make another large move before the previous one settles. Chasing a tight end or receiver could accidentally break the core.",
    managerPattern: "Edward tied for the league lead with 12 completed trades and made some of the season's best and worst bets. The Jahmyr Gibbs acquisition was a smash; selling Bo Nix for Dylan Sampson and $100 FAAB was the opposite. The waiver ledger was just as bold, including $101 for Travis Etienne.",
    transactionPrediction: "Another blockbuster is close to inevitable. Edward is likely to make one excellent consolidation and one baffling counter-move, with tight end the stated reason. No owner has a wider transaction outcome range.",
    signatureMove: "Acquired Jahmyr Gibbs in Week 9 for Brian Thomas, Jaylen Waddle and Tyrone Tracy—the exact kind of star consolidation that can win a league.",
    cautionaryMove: "Sent Bo Nix away in Week 2 for Dylan Sampson and $100 FAAB; Nix produced 317 provider points afterward.",
    waiverWin: "Travis Etienne for $101 in Week 1; expensive, but 241.9 provider points followed.",
    transactions2025: { completed: 84, waivers: 21, freeAgents: 49, trades: 12 },
  },
  {
    ownerName: "Conner Malley",
    slug: "conner-malley",
    verdict: "Relentless dealmaker",
    tone: "aggressive",
    thesis: "King of January has Ja'Marr Chase, useful tight-end depth and stable two-quarterback scoring. The model ranks the team eighth because receiver value falls to sixth across the full weekly lineup, the roster carries five injury flags and the projected schedule leaves very little margin in close weeks.",
    titleCase: "Lamar Jackson, Drake Maye and Chase can erase ordinary lineup mistakes. If Zay Flowers and Jaylen Waddle are healthy while Tyler Warren hits, the current low grade will look far too pessimistic.",
    collapseCase: "Five injury flags and a sixth-ranked receiver room leave almost no slack. Conner's instinct is to solve every soft spot with another trade, which can turn one weakness into three smaller ones.",
    managerPattern: "No 2025 owner traded more often. Conner logged 104 completed moves and 12 trades, with useful free finds such as Rachaad White and Josh Downs. The packages ranged from excellent timing to four-player churn that was hard to evaluate even one week later.",
    transactionPrediction: "Multiple trades are the safest forecast on this page. Conner probably makes one sharp buy before the market catches up and one unnecessarily complicated deal that the group chat calls stupid. Wide receiver is the target; tight end depth is the currency.",
    signatureMove: "Turned J.K. Dobbins into DeVonta Smith, RJ Harvey and Jake Ferguson in Week 4, a strong quantity-and-upside return.",
    cautionaryMove: "The Week 9 Lamar Jackson package sent Matthew Stafford, DeVonta Smith and George Pickens out with another asset—a massive bet on one premium quarterback.",
    waiverWin: "Kareem Hunt for $0 in Week 2; 134.8 provider points followed.",
    transactions2025: { completed: 104, waivers: 31, freeAgents: 57, trades: 12 },
  },
  {
    ownerName: "Samuel Kirby",
    slug: "samuel-kirby",
    verdict: "Champion under correction",
    tone: "aggressive",
    thesis: "The defending champion has Jayden Daniels, De'Von Achane, Derrick Henry, Nico Collins and Justin Jefferson. That core creates the league's No. 2 lineup value even before Samuel finishes the open kicker, defense and seventh-ranked receiver-depth work.",
    titleCase: "Samuel's 30–12 three-year record is the best active win rate in the league. If he converts excess running backs into a tight end, defense and healthier receiver depth, the current contender profile becomes even harder to attack.",
    collapseCase: "The roster is overexposed to running back and still has no settled kicker/defense projection in the snapshot. If the lineup remains unfinished and the star receivers miss time, raw name value will not fill thirteen legal slots.",
    managerPattern: "Samuel led the league with 95 completed 2025 transactions but made only two trades. That is aggressive waiver churn, not reckless trading. The Bo Nix acquisition for Dylan Sampson and $100 FAAB was a major win, and Daniel Jones cost nothing.",
    transactionPrediction: "Samuel will churn the bottom four roster spots immediately, then market an RB to the league's thinnest backfields. The likely move is a good pickup plus a practical depth trade. The stupid outcome would be refusing to sell because every running back looks too valuable.",
    signatureMove: "Acquired Bo Nix in Week 2 for Dylan Sampson and $100 FAAB; 317 provider points followed Nix from that point.",
    cautionaryMove: "The warning is roster construction rather than a single bad 2025 trade: holding excess RB value while lineup slots remain incomplete.",
    waiverWin: "Daniel Jones for $0 in Week 1; 238.4 provider points followed.",
    transactions2025: { completed: 95, waivers: 31, freeAgents: 60, trades: 2 },
  },
];

export const season2026Editorial = Object.fromEntries(
  dossiers.map((dossier) => [dossier.ownerName, dossier]),
) as Record<string, Season2026OwnerEditorial>;

export function ownerSlug(ownerName: string): string {
  return season2026Editorial[ownerName]?.slug || ownerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function findOwnerEditorial(value: string | undefined): Season2026OwnerEditorial | undefined {
  if (!value) return undefined;
  return dossiers.find((dossier) => dossier.slug === value || dossier.ownerName === value);
}
