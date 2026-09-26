import { Card, CardContent } from '@/components/ui/card';

export default function TermsAndConditions() {
  return (
    <div className='common-container my-26 space-y-8'>
      <div className='mb-8'>
        <h1 className='text-foreground mb-2 text-4xl font-bold text-balance'>Terms & Conditions</h1>
        <p className='text-muted-foreground'>Last updated: 22th September 2025</p>
      </div>
      <Card>
        <CardContent className='p-6'>
          <p className='text-muted-foreground text-lg leading-relaxed'>
            Welcome to TechSprout School. By accessing or using our website and services, you agree
            to these Terms & Conditions.
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>1. Eligibility</h2>
        <Card>
          <CardContent className='p-6'>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Our services are designed for students from Grade 6 to pre-graduation.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Students under 18 must have parental/guardian consent to register.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>2. Accounts</h2>
        <Card>
          <CardContent className='p-6'>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                You must provide accurate information during registration.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Parents/guardians are responsible for monitoring student activity.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Do not share login details with others.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>3. Use of Services</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground mb-4 leading-relaxed'>You agree to:</p>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Use our courses and resources only for educational purposes.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Not misuse the platform for harmful, illegal, or disruptive activities.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Respect instructors, students, and staff in all communications.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>4. Payments & Refunds</h2>
        <Card>
          <CardContent className='p-6'>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Some courses and services may require payment.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Refund policies will be stated at the time of purchase.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                We reserve the right to modify pricing with prior notice.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>5. Intellectual Property</h2>
        <Card>
          <CardContent className='p-6'>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                All course materials, videos, and resources belong to TechSprout School.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                You may not copy, resell, or distribute our content without permission.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>6. Limitation of Liability</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground mb-4 leading-relaxed'>
              TechSprout School is not liable for:
            </p>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Any interruptions or technical issues with the platform.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Any misuse of services by users.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Indirect damages, such as data loss or missed opportunities.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>7. Termination</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>8. Changes to Terms</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              We may update these Terms at any time. Continued use of the platform means you accept
              the updated terms.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>9. Contact Us</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground mb-4 leading-relaxed'>
              For questions about these Terms, contact us at:
            </p>
            <div className='text-muted-foreground space-y-2'>
              <p>
                <strong className='text-foreground'>Email:</strong> info@techsproutschool.com
              </p>
              <p>
                <strong className='text-foreground'>Phone:</strong> +880 1785696469
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
