import { LEGAL } from '../../lib/legal';
import { Callout, LegalLayout, Mail, Section, UL } from './LegalLayout';

export function AcceptableUse() {
  return (
    <LegalLayout title="Acceptable Use & Copyright">
      <p>These rules keep {LEGAL.appName} safe. They are part of our Terms of Service.</p>
      <Section title="You may not">
        <UL
          items={[
            'post illegal content, or content that sexualises or endangers minors (we report child sexual abuse material to the relevant authorities);',
            'threaten, harass, stalk, dox, or incite violence or hatred against people or groups;',
            'post non-consensual intimate images, graphic gore, or content that promotes self-harm;',
            'impersonate others, run scams, phishing or fake accounts, or manipulate engagement;',
            'send spam, bulk or unsolicited messages, or scrape/harvest data without permission;',
            'upload malware, probe or attack the service, or evade bans, rate limits or security controls;',
            'infringe others’ copyright, trademarks, privacy or other rights.',
          ]}
        />
      </Section>
      <Section title="Reporting and enforcement">
        <p>
          Report content or accounts to <Mail to={LEGAL.supportEmail} />. We may remove content, limit features, suspend or terminate accounts, and notify
          authorities where required. Where feasible we tell you why and how to appeal. You can also block and mute accounts yourself.
        </p>
      </Section>
      <Section title="Copyright (DMCA and equivalents)">
        <p>We respect intellectual property and respond to valid notices. To report infringement send a notice to <Mail to={LEGAL.dmcaEmail} /> containing:</p>
        <UL
          items={[
            'your physical or electronic signature;',
            'identification of the copyrighted work;',
            'the exact URL of the allegedly infringing material;',
            'your contact details;',
            'a statement that you have a good-faith belief the use is not authorised by the owner, its agent or the law;',
            'a statement, under penalty of perjury, that the notice is accurate and you are the owner or authorised to act for them.',
          ]}
        />
        <p>
          If your content is removed you may send a counter-notice to the same address. We terminate the accounts of repeat infringers in appropriate
          circumstances.
        </p>
        <Callout>Knowingly submitting a false notice may expose you to legal liability.</Callout>
      </Section>
    </LegalLayout>
  );
}
