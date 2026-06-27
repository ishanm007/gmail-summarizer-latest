export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050513] px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-indigo-500/20 bg-[#0d0c24] p-8">
        <h1 className="text-4xl font-bold">Terms of Service</h1>

        <p className="mt-4 text-indigo-200/70">
          By using Inbix Email Assistant, you agree to use the app responsibly
          and only with your own Google account.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Service Usage</h2>
        <p className="mt-3 text-indigo-200/70">
          Inbix provides AI-powered email summaries, categories, saved summaries,
          weekly reports, and inbox insights. The service may change over time.
        </p>

        <h2 className="mt-8 text-2xl font-bold">User Responsibility</h2>
        <p className="mt-3 text-indigo-200/70">
          You are responsible for reviewing summaries before acting on them. AI
          summaries may occasionally be incomplete or inaccurate.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Account Access</h2>
        <p className="mt-3 text-indigo-200/70">
          Inbix uses Google sign-in and Gmail permissions only to provide the app
          features you choose to use.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Contact</h2>
        <p className="mt-3 text-indigo-200/70">
          For questions, contact the app owner using the support email listed on
          the Google OAuth consent screen.
        </p>
      </div>
    </main>
  );
}