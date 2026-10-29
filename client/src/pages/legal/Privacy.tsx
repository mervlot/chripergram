import { Link } from 'react-router-dom';
import { LEGAL } from '../../lib/legal';
import { Callout, LegalLayout, Mail, Section, UL } from './LegalLayout';

export function Privacy() {
  const a = LEGAL.appName;
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains what personal data {a} collects, why, how it is protected, who it is shared with and the
        choices and rights you have. The controller of your data is <b>{LEGAL.entity}</b>, {LEGAL.address} (“we”, “us”).
        Privacy contact: <Mail to={LEGAL.privacyEmail} />.
      </p>

      <Callout>
        <b>The short version.</b> Your <b>email address, password and profile details stay private</b> and are never sold.
        Your <b>direct messages and private community chats are private</b> and are never used to train AI. Posts you make{' '}
        <b>publicly</b> are public by nature and may be used by us to develop and train AI systems, with usernames and
        contact details removed (see section 5).
      </Callout>

      <Section title="1. Data we collect">
        <UL
          items={[
            <><b>Account data:</b> email address, username, display name, password (stored only as a salted bcrypt hash, never in readable form), and your consent record (which Terms/Privacy version you accepted and when).</>,
            <><b>Profile data you choose to add:</b> bio, link, location, avatar, banner, game status.</>,
            <><b>Content you create:</b> posts, replies, polls, stories, reactions, bookmarks, community posts, and uploaded images, audio, video.</>,
            <><b>Private communications:</b> direct messages and community chat messages, including attachments and voice/video notes.</>,
            <><b>Technical data:</b> IP address, browser/device type (user-agent), session information, approximate last-active time, security and abuse-prevention logs.</>,
            <><b>Activity signals:</b> likes, follows, searches and views, used to rank your feed and recommendations.</>,
            <><b>Sign-in with Google:</b> if you use it, Google gives us your verified email, name, profile picture and a Google account identifier. We do not receive your Google password.</>,
            <><b>Email interactions:</b> the verification and security codes we send you and whether you unsubscribed from non-essential email.</>,
            <><b>Calls:</b> voice/video calls are sent peer-to-peer between participants; we relay only the connection signalling and do not record calls.</>,
          ]}
        />
        <p>We do not knowingly collect sensitive categories of data and ask that you do not post others’ private information.</p>
      </Section>

      <Section title="2. Why we use it, and our legal bases (GDPR / UK GDPR)">
        <UL
          items={[
            <><b>Provide the service</b> (create your account, show your posts, deliver messages, run calls): <i>performance of a contract</i>.</>,
            <><b>Verify your email and secure your account</b> (codes, login protection, fraud and abuse prevention): <i>legitimate interests</i> and <i>contract</i>.</>,
            <><b>Personalise your feed and improve the product:</b> <i>legitimate interests</i>.</>,
            <><b>Develop and train AI on public posts:</b> <i>legitimate interests</i>, subject to your right to object (section 5).</>,
            <><b>Non-essential email/news, only if you opted in:</b> <i>consent</i>, which you can withdraw at any time.</>,
            <><b>Comply with law</b> and respond to lawful requests: <i>legal obligation</i>.</>,
          ]}
        />
      </Section>

      <Section title="3. Your messages are private">
        <UL
          items={[
            'Direct messages and private community chats are visible only to the people in that conversation and to our systems that store and deliver them.',
            'We do not read your messages, do not use them to train AI, do not use them for advertising and do not sell them.',
            <>
              <b>They are not end-to-end encrypted.</b> They are encrypted in transit (HTTPS/TLS) but stored on our servers in a form our systems can
              read so the service can deliver, sync and search them. A person with access to our servers could technically access them, which is why access is
              restricted and logged.
            </>,
            'We may access or disclose specific messages only: (a) to investigate a report of abuse you or another participant submitted, (b) to comply with a valid legal process, or (c) to protect safety or prevent serious harm. Other participants can keep a copy of anything you send them.',
          ]}
        />
      </Section>

      <Section title="4. What is public and what is private">
        <UL
          items={[
            <><b>Public:</b> your username, display name, avatar, banner, bio, link and location, plus your public posts, replies, follower/following lists and likes counts. Anyone, including people without an account and search engines, may see these.</>,
            <><b>Never public:</b> your email address, password, login sessions, IP address, direct messages, private-community content, bookmarks and blocks/mutes.</>,
          ]}
        />
      </Section>

      <Section title="5. Public posts and AI training">
        <p>
          You own your content. By posting <b>publicly</b> you allow us to use that public content to develop, train, evaluate and improve machine-learning
          and AI systems (see Terms, section 5). To protect your privacy:
        </p>
        <UL
          items={[
            <>Only content you made <b>public</b> is eligible. Direct messages, private community chats and posts, drafts, stories after they expire, deleted posts, and anything that was never public are <b>excluded</b>.</>,
            <>Your <b>email address, password, IP/device data and private profile data are never used</b> for training. We do not use your profile (bio, links, location, avatar) as a training source.</>,
            <>Where practical we remove usernames, @mentions and contact details (emails, phone numbers) from training data.</>,
            <>We do not sell your personal data. If we ever share datasets with partners, they will be bound by contract not to attempt to re-identify people.</>,
            <><b>Your choice.</b> You may object to AI training use of your public posts at any time by emailing <Mail to={LEGAL.privacyEmail} />. We will exclude your content from future training sets. Deleting a post or your account removes it from future datasets, though models already trained cannot practically “unlearn” it.</>,
          ]}
        />
      </Section>

      <Section title="6. Who we share data with">
        <p>We do not sell personal data and do not share it for cross-context behavioural advertising. We share it only with:</p>
        <UL
          items={[
            <><b>Service providers (processors)</b> acting on our instructions: hosting/infrastructure, media storage (e.g. Cloudinary, if enabled), and email delivery (e.g. Google Gmail/SMTP) to send verification and reset codes.</>,
            <><b>Google</b>, if you choose “Sign in with Google”.</>,
            <><b>Authorities or other parties</b> where required by law, to enforce our Terms, or to protect rights, safety and security.</>,
            <><b>A successor</b> if we are involved in a merger, acquisition or sale of assets, with notice to you and the same protections.</>,
          ]}
        />
      </Section>

      <Section title="7. International transfers">
        <p>
          Our providers may process data in countries other than yours, including outside the EEA/UK. Where required we rely on safeguards such as the
          European Commission’s Standard Contractual Clauses or an adequacy decision.
        </p>
      </Section>

      <Section title="8. How long we keep data">
        <UL
          items={[
            <>Account, profile, posts and messages: until you delete them or your account.</>,
            <>Verification/reset codes: expire after {10} minutes and are deleted once used or after repeated wrong guesses.</>,
            <>Login sessions: last up to one day before they must be renewed, and end immediately when you sign out.</>,
            <>Stories: automatically expire after 24 hours.</>,
            <>Security and abuse logs: kept only as long as needed for security, generally up to 12 months.</>,
            <>Backups and legal holds: deleted data may persist in backups for a limited period, then is overwritten. We may keep minimal records where the law requires it (for example, proof of consent and unsubscribe requests).</>,
          ]}
        />
      </Section>

      <Section title="9. Your rights">
        <p>Depending on where you live (including the EEA/UK, California and other US states, Canada, Brazil, Australia) you can:</p>
        <UL
          items={[
            'access a copy of your data and receive it in a portable format;',
            'correct inaccurate data (you can edit most of it in Settings);',
            'delete your data and account;',
            'object to or restrict certain processing, including AI training on your public posts;',
            'withdraw consent at any time (for example, unsubscribe from email);',
            'not be discriminated against for exercising your rights;',
            'lodge a complaint with your data-protection authority.',
          ]}
        />
        <p>
          <b>Self-service:</b> in <Link to="/settings" className="text-brand hover:underline">Settings → Your data</Link> you can download all your data
          and permanently delete your account. For anything else, email <Mail to={LEGAL.privacyEmail} />. We respond within 30 days (45 days for California
          requests, extendable where permitted). We may need to verify your identity.
        </p>
        <p>
          <b>California (CCPA/CPRA):</b> we do not “sell” or “share” personal information as defined by those laws, and we do not use or disclose sensitive
          personal information to infer characteristics.
        </p>
      </Section>

      <Section title="10. Security">
        <UL
          items={[
            'Passwords are hashed with bcrypt; we cannot see them.',
            'Email verification is required before an account can sign in; one-time codes are single-use, short-lived and locked after repeated wrong guesses.',
            'All traffic uses HTTPS in production; session cookies are HttpOnly and rotated; sign-in attempts are rate-limited.',
            'Access to production systems is limited to people who need it.',
          ]}
        />
        <p>No system is perfectly secure. If a breach affects your personal data we will notify you and regulators as the law requires (for example within 72 hours to EU authorities where applicable).</p>
      </Section>

      <Section title="11. Email we send you">
        <UL
          items={[
            <><b>Transactional/security emails</b> (verification codes, password-reset codes, password-changed and account-deletion notices) are sent because you asked for them or to protect your account. We send them even if you have unsubscribed from other email.</>,
            <><b>Non-essential email</b> (news, product updates) is sent only if you opted in. Every email contains a working unsubscribe link and our postal address, and we honour unsubscribes promptly (within 10 business days at the latest, normally immediately).</>,
            'We never ask for your password or codes by email. We never share or sell your email address.',
          ]}
        />
      </Section>

      <Section title="12. Children">
        <p>
          {a} is not for anyone under {LEGAL.minAge}, or under the minimum age of digital consent in your country if higher (for example 16 in some EU countries) unless a
          parent or guardian consents. We do not knowingly collect data from children below that age. If you believe a child has given us data, email{' '}
          <Mail to={LEGAL.privacyEmail} /> and we will delete it.
        </p>
      </Section>

      <Section title="13. Cookies and local storage">
        <p>
          We use only strictly necessary storage (a secure session cookie and a few device settings). We do not use advertising or tracking cookies. See{' '}
          <Link to="/cookies" className="text-brand hover:underline">Cookies &amp; Storage</Link>.
        </p>
      </Section>

      <Section title="14. Changes">
        <p>
          We may update this policy. For material changes we will notify you in the app or by email before they take effect. The version and date above show
          the current text.
        </p>
      </Section>

      <Section title="15. Contact">
        <p>
          {LEGAL.entity}, {LEGAL.address}. Privacy: <Mail to={LEGAL.privacyEmail} />. General: <Mail to={LEGAL.supportEmail} />.
        </p>
      </Section>
    </LegalLayout>
  );
}
