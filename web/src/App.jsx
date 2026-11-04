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
            <RequireAuth>
              <Exchanges />
            </RequireAuth>
          }
        />
        <Route
          path="/exchanges/:id"
          element={
            <RequireAuth>
              <Exchange />
            </RequireAuth>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireAuth>
              <Groups />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <RequireAuth>
              <Group />
            </RequireAuth>
          }
        />
        <Route path="/g/:token" element={<JoinGroup />} />
        <Route path="/x/:token" element={<JoinExchange />} />
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
