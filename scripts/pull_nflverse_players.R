library(nflreadr)
library(arrow)

dir.create("data_raw", showWarnings = FALSE, recursive = TRUE)

p <- load_players()
write_parquet(p, "data_raw/nflverse_players.parquet")
