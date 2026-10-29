import { Link } from 'react-router-dom';
import { LEGAL } from '../../lib/legal';
import { LegalLayout, Mail, Section, UL } from './LegalLayout';

export function Cookies() {
  return (
    <LegalLayout title="Cookies & Local Storage">
      <p>
        {LEGAL.appName} uses only what is strictly necessary to run the service. Because these are essential, they do not require a consent banner under the
        ePrivacy Directive/PECR. We do <b>not</b> use advertising, analytics or cross-site tracking cookies.
      </p>
      <Section title="What we store">
        <UL
          items={[
            <><b>refreshToken cookie</b> — HttpOnly, Secure (on HTTPS), keeps you signed in on this device; expires within one day and is rotated on use. Deleted when you sign out.</>,
            <><b>Local storage</b> — your theme, language, call/device preferences, unsent post drafts and cached UI state on your device only. Never sent to advertisers.</>,
            <><b>Service worker cache</b> — lets the app load faster and work offline.</>,
          ]}
        />
      </Section>
      <Section title="Third parties">
        <p>
          If you click “Continue with Google”, Google may set its own cookies on its own pages under Google’s policies. Media you upload may be served from our
          media provider’s domain.
        </p>
      </Section>
      <Section title="Your control">
        <p>
          You can clear cookies and site data in your browser at any time; you will simply be signed out. More in the{' '}
          <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link>. Questions: <Mail to={LEGAL.privacyEmail} />.
        </p>
      </Section>
    </LegalLayout>
  );
}
