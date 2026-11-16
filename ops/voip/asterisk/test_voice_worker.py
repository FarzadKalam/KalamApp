import io
import unittest
from pathlib import Path
from unittest.mock import patch
from voice_worker import VoiceAGI, folder_for


class ListenIsolationTest(unittest.TestCase):
    def handler(self):
        handler = object.__new__(VoiceAGI)
        handler.wfile = io.BytesIO()
        handler.rfile = io.BytesIO(b'200 result=1\n200 result=1\n')
        return handler

    def test_untrusted_code_or_endpoint_never_reaches_the_database_or_audio(self):
        for code, endpoint in [('123', 'b_' + '1' * 32 + '_browser'),
                               ('*88*' + '1' * 16, 'b_' + '1' * 32 + '_provider'),
                               ('*88*' + '1' * 16, 'PJSIP/b_' + '1' * 32 + '_browser')]:
            with patch('voice_worker.query') as query:
                handler = self.handler()
                handler.join(code, endpoint)
                query.assert_not_called()
                self.assertEqual(handler.wfile.getvalue(), b'')

    def test_denied_membership_has_no_listening_target(self):
        with patch('voice_worker.query', return_value=[]) as query:
            handler = self.handler()
            handler.join('*88*' + '1' * 16, 'b_' + '1' * 32 + '_browser')
            self.assertEqual(handler.wfile.getvalue(), b'')
            sql, args = query.call_args.args
            self.assertIn('b.org_id=s.org_id', sql)
            self.assertIn('m.is_active', sql)
            self.assertIn('s.requested_by=m.user_id', sql)
            self.assertEqual(args[1], '1' * 16)

    def test_exact_authorized_channel_is_the_only_listen_target(self):
        channel = 'PJSIP/b_' + '2' * 32 + '_provider-00000001'
        with patch('voice_worker.query', return_value=[{'channel_name': channel}]):
            handler = self.handler()
            handler.join('*88*' + '1' * 16, 'b_' + '1' * 32 + '_browser')
            self.assertIn(channel.encode(), handler.wfile.getvalue())
            self.assertIn(b'VOICE_ALLOWED 1', handler.wfile.getvalue())

    def test_file_paths_reject_traversal(self):
        with self.assertRaises(ValueError):
            folder_for('../../etc')
        self.assertEqual(folder_for('10000000-0000-4000-8000-000000000001').parent, Path('/var/spool/asterisk/ai-calls'))


if __name__ == '__main__':
    unittest.main()
