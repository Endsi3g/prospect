import unittest
import os
import sys

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.enrichment.free_extensions import FreeSourcingClient
from src.ai_engine.provider import MockProvider

class TestFreeComponents(unittest.TestCase):
    def setUp(self):
        # Create a temp CSV
        with open("temp_test.csv", "w") as f:
            f.write("first_name,last_name,email,title,company_name,company_domain,location\n")
            f.write("Test,User,test@test.com,CEO,OpenAI,openai.com,SF\n")

    def tearDown(self):
        if os.path.exists("temp_test.csv"):
            os.remove("temp_test.csv")

    def test_csv_sourcing(self):
        client = FreeSourcingClient("temp_test.csv")
        leads = client.search_leads({})
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]["first_name"], "Test")
        self.assertEqual(leads[0]["company_domain"], "openai.com")

    def test_mock_provider(self):
        provider = MockProvider()
        res = provider.generate("Test prompt")
        self.assertTrue("[Mock AI]" in res)

if __name__ == '__main__':
    unittest.main()
