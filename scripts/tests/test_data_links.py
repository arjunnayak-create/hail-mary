"""Regression tests against the cached nflverse data (skipped if it is not downloaded)."""
import pytest

import config as C

pytestmark = pytest.mark.skipif(not (C.NFLVERSE / "LATEST_SEASON").exists(), reason="nflverse cache missing")


@pytest.fixture(scope="module")
def data():
    import nfl
    return nfl.load()


def _linked(data, name, season):
    dp = data.draft
    row = dp[(dp["pfr_player_name"] == name) & (dp["season"] == season)].iloc[0]
    pid = row["player_id"]
    return pid, (data.players.at[pid, "name"] if pid in data.players.index else None)


def test_every_drafted_player_who_played_is_linked(data):
    dp = data.draft
    assert int((dp["player_id"].str.startswith("dp-") & (dp["games"].fillna(0) > 0)).sum()) == 0


@pytest.mark.parametrize("draft_name,season,expected", [
    ("Henry Thomas", 1987, "Henry Thomas"),          # namesake debuting the same year
    ("Jimbo Covert", 1983, "Jim Covert"),            # nickname
    ("James Williams", 1990, None),                  # two of them in 1990: checked below
    ("Kevin Williams", 1993, None),
    ("Scoop Gillespie", 1984, "Fernandars Gillespie"),
    ("Karim Abdul-Jabbar", 1996, "Abdul-Karim al-Jabbar"),
    ("Peter Woods", 2026, "Peter Woods"),            # nflverse ID points at a 1980 namesake
])
def test_known_links(data, draft_name, season, expected):
    pid, name = _linked(data, draft_name, season)
    assert not pid.startswith("dp-")
    if expected:
        assert name == expected
    if draft_name == "Peter Woods":
        assert data.players.at[pid, "first_season"] >= 2026


def test_never_played_draftee_is_not_linked_to_brother(data):
    pid, _ = _linked(data, "Judd Garrett", 1990)
    assert pid.startswith("dp-")  # not Jason Garrett


def test_award_bonus_rewards_repeat_and_recent_wins(data):
    import awards
    from build_prompts import award_bonus
    aw = awards.load(data)
    b = award_bonus(aw, "sb_mvp")
    w = aw.wins[aw.wins["award"] == "sb_mvp"]
    latest = w.loc[w["season"].idxmax(), "player_id"]
    brady = w.loc[w["name"] == "Tom Brady", "player_id"].iloc[0]
    assert b[latest] == pytest.approx(C.AWARD_RECENT_BONUS)
    assert b[brady] == pytest.approx(4 * C.AWARD_EXTRA_WIN)
