import { Card, CardContent } from '@/components/ui/card';

export default function PrivacyPolicy() {
  return (
    <div className='common-container my-26 space-y-8'>
      <div className='mb-8'>
        <h1 className='text-foreground mb-2 text-4xl font-bold text-balance'>Privacy & Policy</h1>
        <p className='text-muted-foreground'>Last updated: 22th September 2025</p>
      </div>
      <Card>
        <CardContent className='p-6'>
          <p className='text-muted-foreground text-lg leading-relaxed'>
            At TechSprout School, we respect your privacy and are committed to protecting the
            personal information of our students, parents, and visitors. This Privacy Policy
            explains how we collect, use, and safeguard your data when you use our website, courses,
            and services.
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>1. Information We Collect</h2>
        <Card>
          <CardContent className='space-y-4 p-6'>
            <div>
              <h3 className='text-foreground mb-2 text-lg font-medium'>Personal Information</h3>
              <p className='text-muted-foreground leading-relaxed'>
                Name, email, phone number, grade level, and payment details (if applicable).
              </p>
            </div>
            <div>
              <h3 className='text-foreground mb-2 text-lg font-medium'>Usage Data</h3>
              <p className='text-muted-foreground leading-relaxed'>
                Information about how you use our platform, such as pages visited, time spent, and
                device information.
              </p>
            </div>
            <div>
              <h3 className='text-foreground mb-2 text-lg font-medium'>Student Data</h3>
              <p className='text-muted-foreground leading-relaxed'>
                Assignments, projects, and progress reports generated during learning activities.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>
          2. How We Use Your Information
        </h2>
        <Card>
          <CardContent className='p-6'>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                To create and manage student accounts.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                To provide access to courses, lessons, and resources.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                To personalize learning experiences and track progress.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                To communicate with students and parents regarding updates, support, and educational
                opportunities.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                To process payments for paid programs.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>3. Data Sharing</h2>
        <Card>
          <CardContent className='space-y-4 p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              We do not sell or rent personal data to third parties. Information may be shared with:
            </p>
            <div>
              <h3 className='text-foreground mb-2 text-lg font-medium'>Service Providers</h3>
              <p className='text-muted-foreground leading-relaxed'>
                For secure payment processing, hosting, or analytics.
              </p>
            </div>
            <div>
              <h3 className='text-foreground mb-2 text-lg font-medium'>Legal Requirements</h3>
              <p className='text-muted-foreground leading-relaxed'>
                If required by law or to protect rights, safety, or property.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>4. Cookies and Tracking</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              We use cookies and similar technologies to improve user experience, track performance,
              and personalize content.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>5. Student Safety</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              Since our platform serves minors, we require parental/guardian consent for account
              creation and purchases.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>6. Data Security</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground leading-relaxed'>
              We implement industry-standard security measures to protect personal data, but no
              online system is 100% secure.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>7. Your Rights</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground mb-4 leading-relaxed'>Parents and students may:</p>
            <ul className='text-muted-foreground space-y-3 leading-relaxed'>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Request access to personal data.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Ask for corrections or deletion.
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-primary mt-1'>•</span>
                Withdraw consent at any time (this may limit access to services).
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className='text-foreground mb-4 text-2xl font-semibold'>8. Contact Us</h2>
        <Card>
          <CardContent className='p-6'>
            <p className='text-muted-foreground mb-4 leading-relaxed'>
              If you have questions about this Privacy Policy, contact us at:
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
