export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your FPL Decision Helper. Make smart captaincy, XI, and transfer decisions based on EV, EO, and rMins.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 border rounded-lg bg-card hover:border-primary/50 transition-colors">
          <h2 className="text-xl font-semibold mb-2">Captain Decision</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter 2 players and get instant tolerance-based recommendation balancing EV and EO risk
          </p>
          <a
            href="/captain"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Analyze Captain
          </a>
        </div>

        <div className="p-6 border rounded-lg bg-card hover:border-primary/50 transition-colors">
          <h2 className="text-xl font-semibold mb-2">XI Optimizer</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter 15 players and get optimized starting XI with formation flexibility
          </p>
          <a
            href="/xi"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Optimize XI
          </a>
        </div>
      </div>
    </div>
  );
}
