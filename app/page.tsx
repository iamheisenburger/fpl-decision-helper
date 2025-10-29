export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your FPL Decision Helper. Make smart captaincy, XI, and transfer decisions based on EV, EO, and rMins.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-2">Captain</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tolerance-based captaincy decisions balancing EV and EO risk
          </p>
          <a
            href="/captain"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Analyze Captain
          </a>
        </div>

        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-2">XI Optimizer</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Smart team selection optimizing RAEV with formation flexibility
          </p>
          <a
            href="/xi"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Optimize XI
          </a>
        </div>

        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-2">Transfers</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Horizon-based transfer planning with NetGain projections
          </p>
          <a
            href="/transfers"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Plan Transfers
          </a>
        </div>
      </div>

      <div className="p-6 border rounded-lg bg-card">
        <h2 className="text-xl font-semibold mb-4">Current Gameweek</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Gameweek</p>
            <p className="text-2xl font-bold">10</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Weekly EV Bleed Budget</p>
            <p className="text-2xl font-bold">0.0 / 0.8</p>
          </div>
        </div>
      </div>
    </div>
  );
}
