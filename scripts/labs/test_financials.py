
import unittest
from financials import quarterly_facts
def fact(start,end,val,filed="2026-08-01",form="10-Q"):
 return dict(start=start,end=end,val=val,filed=filed,form=form)
def facts(rows):return {"Revenue":{"units":{"USD":rows}}}
class QuarterTests(unittest.TestCase):
 def test_cumulative_cash_flow_is_differenced(self):
  rows=[fact("2026-01-01","2026-03-31",100),fact("2026-01-01","2026-06-30",250)]
  q=quarterly_facts(facts(rows),["Revenue"])
  self.assertEqual(q["2026-06-30"]["val"],150)
 def test_annual_produces_only_fourth_quarter(self):
  rows=[fact("2025-01-01","2025-09-30",650),fact("2025-01-01","2025-12-31",900,form="10-K")]
  q=quarterly_facts(facts(rows),["Revenue"]);self.assertEqual(q["2025-12-31"]["val"],250)
 def test_missing_prior_is_not_zero(self):
  q=quarterly_facts(facts([fact("2026-01-01","2026-06-30",250)]),["Revenue"])
  self.assertNotIn("2026-06-30",q)
 def test_latest_restatement_wins(self):
  q=quarterly_facts(facts([fact("2026-01-01","2026-03-31",100,"2026-05-01"),fact("2026-01-01","2026-03-31",120)]),["Revenue"])
  self.assertEqual(q["2026-03-31"]["val"],120)
 def test_direct_quarter_beats_derived(self):
  rows=[fact("2026-01-01","2026-03-31",100),fact("2026-01-01","2026-06-30",250),fact("2026-04-01","2026-06-30",160)]
  self.assertEqual(quarterly_facts(facts(rows),["Revenue"])["2026-06-30"]["val"],160)
 def test_weighted_shares_never_subtracted(self):
  q=quarterly_facts(facts([fact("2026-01-01","2026-03-31",100),fact("2026-01-01","2026-06-30",105)]),["Revenue"],additive=False)
  self.assertNotIn("2026-06-30",q)
if __name__=="__main__":unittest.main()
