import { Route, Switch } from 'wouter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import ApiKeys from './pages/ApiKeys';
import Bans from './pages/Bans';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import IPIntelligence from './pages/IPIntelligence';
import Login from './pages/Login';

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white font-mono flex items-center justify-center">
        <div className="text-xs text-[#888] animate-pulse">INITIALIZING SYSTEM...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Authenticated - show dashboard
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/keys" component={ApiKeys} />
        <Route path="/bans" component={Bans} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={Settings} />
        <Route path="/ip-intel" component={IPIntelligence} />
        <Route>
          <div className="flex h-full items-center justify-center text-[#888]">
            404 | NOT FOUND
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
