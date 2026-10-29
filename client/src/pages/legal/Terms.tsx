import { Link } from 'react-router-dom';
import { LEGAL } from '../../lib/legal';
import { Callout, LegalLayout, Mail, Section, UL } from './LegalLayout';

export function Terms() {
  const a = LEGAL.appName;
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms are a binding agreement between you and <b>{LEGAL.entity}</b> (“we”, “us”) governing your use of {a}. By creating an account or using the
        service you agree to them and to our{' '}
        <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link>,{' '}
        <Link to="/acceptable-use" className="text-brand hover:underline">Acceptable Use &amp; Copyright</Link> rules and{' '}
        <Link to="/cookies" className="text-brand hover:underline">Cookies notice</Link>. If you do not agree, do not use {a}.
      </p>

      <Section title="1. Eligibility and your account">
        <UL
          items={[
            <>You must be at least {LEGAL.minAge} years old (or the minimum age of digital consent in your country, if higher) and able to form a binding contract.</>,
            'You must give accurate information and verify your email address. One person may not run accounts to evade a ban.',
            'You are responsible for your password and for everything done under your account. Tell us immediately at the support address below if you suspect unauthorised access.',
            'We may require re-verification or limit accounts that look compromised or abusive.',
          ]}
        />
      </Section>

      <Section title="2. Your content and ownership">
        <p>
          You keep ownership of what you post (“Your Content”). You are responsible for it and promise you have the rights to post it and that it does not
          break the law or these Terms.
        </p>
      </Section>

      <Section title="3. Licence to run the service">
        <p>
          You grant us a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, resize, transcode, display, distribute and deliver Your
          Content as needed to operate, secure, promote within the service and improve {a}. For <b>public</b> content, this licence includes showing it to
          anyone and letting others share it using the service’s features. The licence ends when you delete the content or your account, except for copies
          already shared by others, reasonable backup retention and uses described in section 5.
        </p>
      </Section>

      <Section title="4. Direct messages are private">
        <p>
          Content of direct messages and private community chats is not published, not used for advertising and not used for AI training. See the{' '}
          <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link> for what “private” means in practice (including that messages
          are encrypted in transit but not end-to-end encrypted).
        </p>
      </Section>

      <Section title="5. Public posts and AI training">
        <Callout>
          <b>Plain English:</b> if you post something publicly, we may use that public post to build and train AI. We do not use your email, password,
          private profile data, or private messages for that.
        </Callout>
        <p>
          You grant us a worldwide, non-exclusive, perpetual, royalty-free, sublicensable licence to use Your <b>publicly visible</b> posts, replies and
          captions (and the public media attached to them) to develop, train, test and improve machine-learning models, including generative AI, whether
          operated by us or by our service providers on our behalf. This licence:
        </p>
        <UL
          items={[
            'does not cover direct messages, private community content, drafts, expired or deleted content, your email address, password, security data or other account data;',
            'applies to your profile only to the extent it is displayed alongside a public post; we do not use profile information (bio, links, location, avatar) as training data;',
            'is exercised with usernames, @mentions and contact details removed where practical;',
            <>is subject to your right to object: email <Mail to={LEGAL.privacyEmail} /> and we will exclude your public content from future training.</>,
          ]}
        />
        <p>Content you did not create and have no right to license must not be posted publicly.</p>
      </Section>

      <Section title="6. Rules">
        <p>
          You must follow our{' '}
          <Link to="/acceptable-use" className="text-brand hover:underline">Acceptable Use rules</Link>. We may remove content or restrict or terminate
          accounts that break them, with notice where reasonably possible. You can appeal by emailing <Mail to={LEGAL.supportEmail} />.
        </p>
      </Section>

      <Section title="7. Email and notifications">
        <p>
          We send verification and security emails because they are necessary to run your account. We send other email only if you opt in, and each includes
          an unsubscribe link. You can also change notification settings in the app.
        </p>
      </Section>

      <Section title="8. Our rights">
        <p>
          The service, software, design and trademarks belong to us or our licensors. We give you a limited, revocable, non-transferable licence to use the
          service for personal purposes. You may not copy, reverse-engineer (except where law allows), resell or scrape the service.
        </p>
      </Section>

      <Section title="9. Third-party services">
        <p>The service may link to or rely on third parties (such as Google sign-in). Their terms and privacy policies apply to your use of them. We are not responsible for them.</p>
      </Section>

      <Section title="10. Ending your account">
        <p>
          You can delete your account at any time in Settings. We may suspend or terminate access for breach, legal reasons, security or prolonged inactivity.
          Sections that by nature should survive (ownership, licences already granted for shared content, disclaimers, liability, governing law) survive
          termination.
        </p>
      </Section>

      <Section title="11. Disclaimers">
        <p>
          The service is provided “as is” and “as available”. To the fullest extent the law allows, we disclaim all warranties, including merchantability,
          fitness for a particular purpose and non-infringement, and do not promise the service will be uninterrupted, error-free or free of harmful
          content posted by other users. Nothing here limits rights you have under mandatory consumer law.
        </p>
      </Section>

      <Section title="12. Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential or punitive damages, or loss of profits,
          data or goodwill, and our total liability for any claim relating to the service is limited to the greater of the amount you paid us in the 12
          months before the claim or USD 100. Nothing excludes liability that cannot be excluded by law (for example for fraud, death or personal injury caused
          by negligence).
        </p>
      </Section>

      <Section title="13. Indemnity">
        <p>
          To the extent permitted by law, you will indemnify us against claims, losses and costs arising from Your Content or your breach of these Terms or
          the law.
        </p>
      </Section>

      <Section title="14. Governing law and disputes">
        <p>
          These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to conflict-of-law rules, and courts there have jurisdiction, except
          that consumers keep any mandatory protections and venue rights of their country of residence. Please contact us first at{' '}
          <Mail to={LEGAL.supportEmail} /> so we can try to resolve a dispute informally.
        </p>
      </Section>

      <Section title="15. Changes">
        <p>
          We may update these Terms. For material changes we will give reasonable notice in the app or by email, and continuing to use {a} afterwards means
          you accept them. If you do not agree, delete your account before they take effect.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          {LEGAL.entity}, {LEGAL.address} · <Mail to={LEGAL.supportEmail} />
        </p>
      </Section>
    </LegalLayout>
  );
}
