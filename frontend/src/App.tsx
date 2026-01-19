import { Route, Switch } from 'wouter';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import ApiKeys from './pages/ApiKeys';
import Bans from './pages/Bans';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/keys" component={ApiKeys} />
        <Route path="/bans" component={Bans} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/settings" component={Settings} />
        <Route>
          <div className="flex h-full items-center justify-center text-[#888]">
            404 | NOT FOUND
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

export default App;
