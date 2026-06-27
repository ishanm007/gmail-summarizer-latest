export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050513] px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-indigo-500/20 bg-[#0d0c24] p-8">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>

        <p className="mt-4 text-indigo-200/70">
          Inbix Email Assistant helps users summarize and organize their Gmail
          inbox using AI.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Data We Access</h2>
        <p className="mt-3 text-indigo-200/70">
          Inbix accesses Gmail data only after you sign in with Google and grant
          permission. We use this access to fetch emails, generate summaries,
          detect categories, and show relevant email insights.
        </p>

        <h2 className="mt-8 text-2xl font-bold">How We Use Data</h2>
        <p className="mt-3 text-indigo-200/70">
          Your email data is used only to provide app features such as AI
          summaries, saved summaries, weekly reports, categories, and action
          items. We do not sell your personal data.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Data Storage</h2>
        <p className="mt-3 text-indigo-200/70">
          Inbix may store account information, OAuth tokens, usage data, and
          generated summaries so that the app works across sessions.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Contact</h2>
        <p className="mt-3 text-indigo-200/70">
          For privacy questions, contact the app owner at the support email
          listed on the Google OAuth consent screen.
        </p>
      </div>
    </main>
  );
}