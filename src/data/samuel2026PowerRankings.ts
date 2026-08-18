export type SamuelRankingEntity = {
  label: string;
  kind: "player" | "owner";
  search?: string;
  owner?: string;
};

export type SamuelPowerRanking = {
  rank: number;
  owner: string;
  analysis: string;
  entities: SamuelRankingEntity[];
};

export const samuel2026PowerRankings = {
  title: "Post-Draft Power Rankings",
  author: "Samuel",
  season: 2026,
  phase: "Preseason · Post-Draft",
  rankings: [
    {
      rank: 1,
      owner: "Samuel",
      analysis: "A 30-12 record since joining the league, it really couldn’t be anyone else. Admittedly a top heavy team this year with some interesting characters at WR3, but the incoming WR1 and QB1 finishes from Jefferson and Kyler will be scary. WR3 will be looking comfortable by the playoffs once Mr. Downs comes begging for a RB in a couple weeks. If I could do the draft again would I spend $27 on Corum, JCM, and White? Probably not but at least the league will be interesting this year",
      entities: [
        { label: "Jefferson", kind: "player", search: "Justin Jefferson" },
        { label: "Kyler", kind: "player", search: "Kyler Murray" },
        { label: "Mr. Downs", kind: "player", search: "Josh Downs" },
        { label: "Corum", kind: "player", search: "Blake Corum" },
        { label: "JCM", kind: "player", search: "JCM" },
        { label: "White", kind: "player", search: "White" },
      ],
    },
    {
      rank: 2,
      owner: "Conner",
      analysis: "Important to note that these post-draft rankings do not reflect the managers propensity to fuck up his team by week 3. This team is led by strong QB play, a solid RB room, and a strong WR room. While the depth is questionable I like this starting lineup and expect a bounce back year from the bipolar manager this year. Although his own AI not trusting him may be a red flag.",
      entities: [],
    },
    {
      rank: 3,
      owner: "John",
      analysis: "Despite having a thin RB room, there is a world where this team really clicks. QB1 + a promising prospect in Mahomes who Roy says could be good at football. A great 1+2 punch at RB, the best value keeper on the board with Olave, and strong overall WR depth makes this team a definite contender. Will be keeping a close eye on Brooks here as a strong upside play.",
      entities: [
        { label: "Mahomes", kind: "player", search: "Patrick Mahomes" },
        { label: "Roy", kind: "owner", owner: "Roy" },
        { label: "Olave", kind: "player", search: "Chris Olave" },
        { label: "Brooks", kind: "player", search: "Brooks" },
      ],
    },
    {
      rank: 4,
      owner: "Roy",
      analysis: "This team has a high floor given the combination of Bijan and CMC, which makes it hard to rank the team below midpack. That said the RB3 situation is a mess and I’m not sold on the consistency of some of the WRs taken here giving the team a lower ceiling than one may expect given the heavy star power in the RB room. The notorious CMC merchant will probably leverage the star to do enough to avoid a kilt bowl fight though.",
      entities: [
        { label: "Bijan", kind: "player", search: "Bijan Robinson" },
        { label: "CMC", kind: "player", search: "Christian McCaffrey" },
      ],
    },
    {
      rank: 5,
      owner: "Jeff",
      analysis: "Some strong upside here, but concerns around Adams age and Skattebo’s injuries prevented me from ranking the team higher. Is the Najee signing a bad sign about his health? TMac has strong potential but will need a strong season from Bryce Young which is no sure thing. I like the depth picks especially P. Washington and Metcalf, with Tuten also having good upside. Despite trolling Carl the QB room is a bit underwhelming, both are solid and will chug along but I don’t expect fireworks.",
      entities: [
        { label: "Adams", kind: "player", search: "Davante Adams" },
        { label: "Skattebo", kind: "player", search: "Cam Skattebo" },
        { label: "Najee", kind: "player", search: "Najee Harris" },
        { label: "TMac", kind: "player", search: "Tetairoa McMillan" },
        { label: "Bryce Young", kind: "player", search: "Bryce Young" },
        { label: "P. Washington", kind: "player", search: "Washington" },
        { label: "Metcalf", kind: "player", search: "DK Metcalf" },
        { label: "Tuten", kind: "player", search: "Bhayshul Tuten" },
        { label: "Carl", kind: "owner", owner: "Carl" },
      ],
    },
    {
      rank: 6,
      owner: "Jared",
      analysis: "Solid lineup, with a relatively high floor but lack of existing upside especially in the RB room. Javonte and Swift are going to get you points but are they going to win you the league? I’m not convinced. That said I expect good seasons from Herbert and Dak which should bring along Lamb and Ladd for the ride. Nabers is the wildcard and a big bet on his health but if it pays off that could be the upside this team needs. Bowers bounce back???",
      entities: [
        { label: "Javonte", kind: "player", search: "Javonte Williams" },
        { label: "Swift", kind: "player", search: "D'Andre Swift" },
        { label: "Herbert", kind: "player", search: "Justin Herbert" },
        { label: "Dak", kind: "player", search: "Dak Prescott" },
        { label: "Lamb", kind: "player", search: "CeeDee Lamb" },
        { label: "Ladd", kind: "player", search: "Ladd McConkey" },
        { label: "Nabers", kind: "player", search: "Malik Nabers" },
        { label: "Bowers", kind: "player", search: "Brock Bowers" },
      ],
    },
    {
      rank: 7,
      owner: "Carl",
      analysis: "This is a glass cannon ass team. Sure the RB room probably got Stephen excited and there is upside there, but this could also be 2 of the worst teams in the league plus 1 mediocre team putting up 15 points a week. Are there enough points out there to be banking your zero depth rb room on these 3 guys? I certainly don’t think so. The WR room is nice no question, but I just don’t know if it can compensate for a weak QB room and risky RB room.",
      entities: [],
    },
    {
      rank: 8,
      owner: "Edward",
      analysis: "Came in to the draft in a tough spot having spent half his budget on his keepers and Europe trip. Ultimately I think both the WR and RB rooms are too weak here, the talent of Gibbs and ARSB are undeniable but weren’t good enough value for the keepers in my opinion. Lemon is WR3 on the eagles, double Jets again is crazy, Henderson is high upside but will have to deal with Stevenson not going anywhere in the rezone, and guys like Jamo and Worthy are just too volatile to be relied on. Hopefully his Europe trip will be fun enough he doesn’t focus on fantasy results too much",
      entities: [
        { label: "Gibbs", kind: "player", search: "Jahmyr Gibbs" },
        { label: "ARSB", kind: "player", search: "Amon-Ra St. Brown" },
        { label: "Lemon", kind: "player", search: "Lemon" },
        { label: "Henderson", kind: "player", search: "TreVeyon Henderson" },
        { label: "Stevenson", kind: "player", search: "Rhamondre Stevenson" },
        { label: "Jamo", kind: "player", search: "Jameson Williams" },
        { label: "Worthy", kind: "player", search: "Xavier Worthy" },
      ],
    },
  ] satisfies SamuelPowerRanking[],
} as const;
