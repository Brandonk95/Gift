import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { useApp } from "./lib/app.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Forgot from "./pages/Forgot.jsx";
import ListEditor from "./pages/ListEditor.jsx";
import SharedList from "./pages/SharedList.jsx";
import Account from "./pages/Account.jsx";
import Shopping from "./pages/Shopping.jsx";
import Exchanges from "./pages/Exchanges.jsx";
import Exchange from "./pages/Exchange.jsx";
import JoinExchange from "./pages/JoinExchange.jsx";
import Groups, { Group, JoinGroup } from "./pages/Groups.jsx";
import NotFound from "./pages/NotFound.jsx";
import Unsubscribe from "./pages/Unsubscribe.jsx";
import Share from "./pages/Share.jsx";
import { ConfirmEmail, ResetPassword, VerifyEmail } from "./pages/EmailAction.jsx";
import { JoinCoOwner } from "./components/CoOwners.jsx";

// Secret Santa and groups can be switched off on the server (pb_hooks/lib/features.js)
function Feature({ name, children }) {
  const { config } = useApp();
  if (!config.features) return null; // still asking the server
  if (!config.features[name]) {
    const [label, is] = name === "santa" ? ["Secret Santa", "is"] : ["Groups", "are"];
    return <NotFound title={`${label} ${is} taking a break`} message={`${label} ${is} turned off for now. Your lists and everything else work as usual.`} />;
  }
  return children;
}

function RequireAuth({ children }) {
  const { user } = useApp();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/verify/:token" element={<VerifyEmail />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/confirm-email/:token" element={<ConfirmEmail />} />
        <Route path="/s/:token" element={<SharedList />} />
        <Route
          path="/lists/:id"
          element={
            <RequireAuth>
              <ListEditor />
            </RequireAuth>
          }
        />
        <Route
          path="/shopping"
          element={
            <RequireAuth>
              <Shopping />
            </RequireAuth>
          }
        />
        <Route
          path="/exchanges"
          element={
            <Feature name="santa"><RequireAuth>
              <Exchanges />
            </RequireAuth></Feature>
          }
        />
        <Route
          path="/exchanges/:id"
          element={
            <Feature name="santa"><RequireAuth>
              <Exchange />
            </RequireAuth></Feature>
          }
        />
        <Route
          path="/groups"
          element={
            <Feature name="groups"><RequireAuth>
              <Groups />
            </RequireAuth></Feature>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <Feature name="groups"><RequireAuth>
              <Group />
            </RequireAuth></Feature>
          }
        />
        <Route path="/g/:token" element={<Feature name="groups"><JoinGroup /></Feature>} />
        <Route path="/o/:token" element={<JoinCoOwner />} />
        <Route path="/x/:token" element={<Feature name="santa"><JoinExchange /></Feature>} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/share" element={<Share />} />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <Account />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
