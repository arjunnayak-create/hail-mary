import config as C
import math

from build_prompts import assign_tiers, tier_counts
from fetch_honors_override import bd_match, parse_honors
from nfl import franchise, name_key
from awards import position_groups, team_franchises


def test_hybrid_tiers_follow_config():
    # T1 10% max 4, T2 25% max 15, rest 45/35/20
    assert tier_counts(187) == [4, 15, 76, 59, 33]
    assert tier_counts(37) == [4, 9, 11, 9, 4]
    assert tier_counts(15) == [2, 4, 5, 3, 1]
    tiers = assign_tiers(187)
    assert len(tiers) == 187 and tiers == sorted(tiers)  # most famous first


def test_head_tiers_never_exceed_caps():
    for n in range(C.MIN_ANSWERS, 800, 7):
        c = tier_counts(n)
        assert sum(c) == n
        assert c[0] <= 4 and c[1] <= 15


def test_small_lists_still_hit_every_tier():
    for n in range(C.MIN_ANSWERS, 60):
        assert set(assign_tiers(n)) == {t["tier"] for t in C.TIERS}, n


def test_name_key():
    assert name_key("Odell Beckham Jr.") == name_key("odell beckham")
    assert name_key("T.J. Watt") == name_key("TJ Watt")
    assert name_key("Ja'Marr Chase") == "jamarrchase"
    assert name_key("Patrick Surtain II") == name_key("Patrick Surtain")


def test_franchise_codes_across_eras():
    assert franchise("STL", 1985) == "ARI"  # St. Louis Cardinals
    assert franchise("STL", 2000) == "LAR"  # St. Louis Rams
    assert franchise("HOU", 1990) == "TEN"  # Oilers
    assert franchise("HOU", 2020) == "HOU"  # Texans
    assert franchise("BAL", 1982) == "IND"  # Baltimore Colts
    assert franchise("BAL", 2000) == "BAL"  # Ravens
    assert franchise("LA", 1980) == "LAR" and franchise("LA", 2020) == "LAR"
    assert franchise("RAI", 1990) == franchise("OAK", 2010) == franchise("LV", 2024) == "LV"
    assert franchise("SD", 2000) == franchise("LAC", 2020) == "LAC"
    assert franchise("NWE", 2001) == "NE" and franchise("SFO", 1985) == "SF"  # PFR codes
    assert franchise("HST", 2005) == "HOU" and franchise("CLV", 2005) == "CLE"


def test_award_position_and_team_parsing():
    assert position_groups("Quarterback") == {"QB"}
    assert position_groups("Defensive end") == {"DL"}
    assert position_groups("Kick returner/punt returner") == set()
    assert team_franchises("Los Angeles Raiders") == {"LV"}
    assert team_franchises("Minnesota") == {"MIN"}


INFOBOX = """{{Infobox gridiron football biography
| name = Test Player
| birth_date = {{Birth date and age|1971|06|22|mf=y}}
| highlights =
* [[Super Bowl Most Valuable Player Award|Super Bowl MVP]] ([[Super Bowl XXXIV|XXXIV]])
* 2× First-team [[All-Pro]] ([[1999 All-Pro Team|1999]], [[2001 All-Pro Team|2001]])
* Second-team All-Pro (2000)
* 4× [[Pro Bowl]] ([[2000 Pro Bowl|1999]]–[[2002 Pro Bowl|2001]], [[2009 Pro Bowl|2008]])
* [[Pro Bowl]] MVP (2000)
| stat_label1 = [[Passing yards]]
| stat_value1 = 32,344
| stat_label2 = [[Touchdown|TD]]–[[Interception|INT]]
| stat_value2 = 208–128
}}
[[Category:Pro Football Hall of Fame inductees]]
"""


def test_parse_honors_from_infobox():
    h = parse_honors(INFOBOX)
    assert h["pro_bowls"] == 4
    assert h["first_team_all_pro"] == 2
    assert h["hof"] is True
    assert h["birth_date"] == "1971-06-22"
    assert h["career_pass_yds"] == 32344
    assert "career_def_ints" not in h  # "TD–INT" is not defensive interceptions


def test_birth_date_matching():
    assert bd_match("1971-06-22", "1971-06-22") == "exact"
    assert bd_match("1953-07-25", "1954-07-25") == "approx"  # nflverse off by a year
    assert bd_match("1960-01-01", "1971-06-22") is None
    assert bd_match(None, "1971-06-22") is None
