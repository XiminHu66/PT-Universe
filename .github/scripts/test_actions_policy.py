from pathlib import Path
import json
import tempfile
import unittest
from actions_policy import validate

class ResourcePolicyTests(unittest.TestCase):
    def test_manual_selection_and_typed_concurrency_are_enforced(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);workflows=root/'.github/workflows';workflows.mkdir(parents=True)
            (root/'.github/actions-resource-policy.json').write_text(json.dumps({'manual_only_workflows':['refresh-3c.yml']}))
            workflow=workflows/'refresh-3c.yml'
            valid="name: manual\n'on':\n  workflow_dispatch:\nconcurrency:\n  group: test\n  cancel-in-progress: false\njobs:\n  check:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps: []\n"
            workflow.write_text(valid);self.assertEqual(validate(root),[])
            workflow.write_text(valid.replace('cancel-in-progress: false',"cancel-in-progress: 'false'"))
            self.assertTrue(any('quoted boolean' in e for e in validate(root)))
            workflow.write_text(valid.replace('  workflow_dispatch:',"  schedule:\n  - cron: '0 * * * *'\n  workflow_dispatch:"))
            self.assertTrue(any('manual-only' in e for e in validate(root)))

if __name__=='__main__':unittest.main()
