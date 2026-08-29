import { Card } from '@/components/ui/Card';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <h1 className="mb-2 font-heading text-2xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="mb-6 text-sm text-muted">Last updated: 28 August 2026</p>

        <div className="flex flex-col gap-6 text-sm text-foreground">
          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">What We Collect</h2>
            <p>
              When you create an account, we collect your email address and a password (which is
              hashed with bcrypt before it&apos;s ever stored — we never see or store your actual
              password). Everything else Budget Buddy holds is financial data you enter yourself:
              expense amounts, descriptions, categories, dates, recurring-expense settings, budgets,
              and category GST-free flags.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">How We Use It</h2>
            <p>
              Solely to run the expense-tracking service itself: authenticating you, showing you your
              own data, and calculating your own totals, budgets, and GST. Budget Buddy has no
              advertising, no analytics tracking, and no behavioral profiling — none of that
              infrastructure exists in this app.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">How It&apos;s Stored</h2>
            <p>
              Your data lives in a Neon (managed PostgreSQL) database, and the app itself runs on
              Vercel. Both are infrastructure providers that process data to operate the service —
              not third parties using it for their own purposes. Every query in this app is scoped to
              your own account, so no other user can access your data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Your Rights</h2>
            <p>
              You can request access to, correction of, or deletion of your data at any time by
              contacting us (see below). Budget Buddy doesn&apos;t yet have a self-service
              &quot;delete my account&quot; button, so these requests are currently handled manually.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Data Retention</h2>
            <p>Your data is kept for as long as your account is active.</p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">
              Changes to This Policy
            </h2>
            <p>
              This policy may be updated as Budget Buddy changes. The most current version will
              always be available at this page.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-heading text-lg font-medium text-foreground">Contact</h2>
            <p>
              Budget Buddy is a personal project without a support team, but you can reach the
              developer directly via{' '}
              <a
                href="https://github.com/saichetankari2001/budget-buddy/issues"
                className="text-primary-hover underline"
              >
                GitHub Issues
              </a>
              .
            </p>
          </section>
        </div>
      </Card>
    </main>
  );
}
