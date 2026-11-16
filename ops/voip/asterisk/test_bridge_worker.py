import unittest
import re
import configparser
from pathlib import Path
from bridge_worker import build_objects, bridge_ids, registration_status, realtime_value


class BridgeObjectsTest(unittest.TestCase):
    def test_realtime_preserves_uri_parameters_and_password_delimiters(self):
        self.assertEqual(realtime_value('sip:pbx.test:5060;transport=tcp'), 'sip:pbx.test:5060^3Btransport=tcp')
        self.assertEqual(realtime_value('fixture;secret^3B'), 'fixture^3Bsecret^5E3B')
        self.assertEqual(realtime_value(5060), 5060)
        self.assertIsNone(realtime_value(None))
    def row(self, bridge_id='10000000-0000-4000-8000-000000000001'):
        return dict(bridge_id=bridge_id, org_id='org-a', extension='101', sip_secret='remote-fixture-secret',
                    browser_secret='local-fixture-secret', metadata=dict(server_url='pbx.example.test', sip_domain='tenant.example.test'))

    def test_provider_secret_never_authenticates_browser(self):
        rows = build_objects(self.row())
        browser, provider = bridge_ids(self.row()['bridge_id'])
        auth = {row['id']: row for row in rows['ps_auths']}
        self.assertEqual(auth[browser]['password'], 'local-fixture-secret')
        self.assertEqual(auth[provider]['password'], 'remote-fixture-secret')
        self.assertNotEqual(browser, provider)
        self.assertNotEqual(bridge_ids('20000000-0000-4000-8000-000000000001')[0], browser)

    def test_two_different_media_transports_and_scoped_inbound_line(self):
        rows = build_objects(self.row())
        browser, provider = rows['ps_endpoints']
        self.assertEqual(browser['transport'], 'transport-wss')
        self.assertEqual(browser['media_encryption'], 'dtls')
        self.assertEqual(provider['transport'], 'transport-udp')
        self.assertEqual(provider['media_encryption'], 'no')
        self.assertEqual(provider['direct_media'], 'no')
        # Advertising Opus on one leg caused answered calls with no audio: this image has no transcoder.
        self.assertEqual(browser['allow'], 'alaw,ulaw')
        self.assertEqual(provider['allow'], browser['allow'])
        registration = rows['ps_registrations'][0]
        self.assertEqual(registration['line'], 'yes')
        self.assertEqual(registration['endpoint'], provider['id'])
        self.assertEqual(registration['contact_user'], browser['id'])
        self.assertNotIn('ps_identify', rows)

    def test_tcp_and_explicit_provider_auth_identity(self):
        row = self.row()
        row['metadata'].update(server_url='sip:pbx.example.test:5070', sip_transport='tcp', auth_username='auth-101')
        rows = build_objects(row)
        self.assertEqual(rows['ps_registrations'][0]['server_uri'], 'sip:pbx.example.test:5070;transport=tcp')
        self.assertEqual(rows['ps_auths'][1]['username'], 'auth-101')

    def test_bad_address_and_shell_content_are_rejected(self):
        for host in ['https://host/path', 'host;transport=udp', 'host\nmalicious', 'user:pass@host', 'host:99999']:
            row = self.row()
            row['metadata']['server_url'] = host
            with self.assertRaises(ValueError):
                build_objects(row)

    def test_unregistered_is_never_reported_as_registered(self):
        self.assertEqual(registration_status('Status: Registered'), 'registered')
        self.assertEqual(registration_status('Status: Unregistered'), 'pending')
        self.assertEqual(registration_status('Status: Rejected'), 'rejected')


class BridgeDialplanTest(unittest.TestCase):
    def setUp(self):
        self.dialplan = Path(__file__).with_name('extensions.conf.template').read_text(encoding='utf-8')

    def context(self, name):
        return self.dialplan.split('[' + name + ']', 1)[1].split('\n[', 1)[0]

    def test_browser_media_is_not_bound_to_the_private_http_listener(self):
        root = Path(__file__).parent
        sip = configparser.ConfigParser(interpolation=None)
        sip.read(root / 'pjsip.conf', encoding='utf-8')
        http = configparser.ConfigParser()
        http.read(root / 'http.conf', encoding='utf-8')
        self.assertEqual(sip['transport-wss']['bind'], '0.0.0.0')
        self.assertEqual(http['general']['bindaddr'], '127.0.0.1')

    def test_routes_read_authenticated_channel_endpoint(self):
        # Asterisk CHANNEL's endpoint is a top-level item, not a pjsip signalling subtype.
        for name, variable in [('kalam-org-router', 'KALAM_EP'),
                               ('taze-external-out', 'BRIDGE_EP'),
                               ('taze-external-in', 'BRIDGE_EP')]:
            self.assertIn('Set(' + variable + '=${CHANNEL(endpoint)})', self.context(name))
        self.assertNotIn('CHANNEL(pjsip,endpoint)', self.dialplan)
        # CUT takes a variable name, not an unevaluated function expression.
        self.assertNotIn('CUT(CHANNEL(', self.dialplan)

    def test_external_routes_cannot_select_another_account_or_reverse_role(self):
        browser, provider = bridge_ids('10000000-0000-4000-8000-000000000001')
        other_browser, _ = bridge_ids('20000000-0000-4000-8000-000000000001')
        for context, expected, rejected, target_role in [
            ('taze-external-out', browser, provider, 'provider'),
            ('taze-external-in', provider, browser, 'browser'),
        ]:
            source = self.context(context)
            match = re.search(r'REGEX\("([^"]+)" \$\{BRIDGE_EP\}\)', source)
            self.assertIsNotNone(match)
            pattern = match.group(1)
            for invalid in ['', rejected, 'browser', expected + '_extra', '../' + expected]:
                self.assertIsNone(re.fullmatch(pattern, invalid))
            self.assertIsNotNone(re.fullmatch(pattern, expected))
            self.assertIn('CUT(BRIDGE_EP,_,1-2)', source)
            self.assertIn('${BRIDGE_PREFIX}_' + target_role, source)
            self.assertNotIn(other_browser, source)
            self.assertLess(source.index('REGEX('), source.index('Dial('))
            self.assertIn('Hangup(21)', source)


if __name__ == '__main__':
    unittest.main()
