import { Alert, App, Button, ConfigProvider } from "antd";
import {
  ApiOutlined,
  BookOutlined,
  CloudDownloadOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { APP_NAME } from "@/config/brand";
import { useUserStore } from "@/store";
import { AboutContent } from "@/layout/LeftNavBar/About";
import { PersonalSettingsContent } from "@/layout/LeftNavBar/PersonalSettings";
import { DesktopVersionPanel } from "@/layout/LeftNavBar/DesktopVersionPanel";
import { useDesktopUpdates } from "@/layout/LeftNavBar/useDesktopUpdates";
import { relocatedMyWorkspace } from "./workspace-navigation";
import { WorkbenchCapabilities } from "./CapabilitySquare";
import { ModelSettings } from "./ModelSettings";
import { PersonalMemoryPanel } from "./PersonalMemoryPanel";
import { PersonalRules } from "./PersonalRules";
import { MyProfile } from "./MyProfile";
import { LabWorkspace } from "./LabWorkspace";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import "./my-workspace.scss";

const sectionGroups = [
  {
    label: "账号",
    items: [{ value: "profile", label: "个人资料", icon: UserOutlined }],
  },
  {
    label: "个人助理",
    items: [
      { value: "memory", label: "我的习惯", icon: BookOutlined },
      { value: "rules", label: "固定要求", icon: SafetyCertificateOutlined },
    ],
  },
  {
    label: "课题组",
    items: [
      { value: "labs", label: "课题组", icon: TeamOutlined },
      { value: "capabilities", label: "课题组能力", icon: ExperimentOutlined },
    ],
  },
  {
    label: "应用设置",
    items: [
      { value: "models", label: "模型设置", icon: ApiOutlined },
      { value: "preferences", label: "通用设置", icon: SettingOutlined },
      { value: "version", label: "版本与帮助", icon: CloudDownloadOutlined },
    ],
  },
];
const sections = sectionGroups.flatMap(({ items }) => items);
const myTheme = {
  token: {
    colorPrimary: "#0968b4",
    colorLink: "#0968b4",
    colorText: "#171d24",
    colorTextSecondary: "#556474",
    colorBorder: "#d6e0eb",
    borderRadius: 9,
  },
};

export function MyWorkspace() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const relocated = relocatedMyWorkspace(params);
  const section = sections.find((item) => item.value === requested) ?? sections[0];
  const view = section.value;
  const generation = useResearchStore((s) => s.generation);
  const navigate = useNavigate(),
    updates = useDesktopUpdates();
  const { modal } = App.useApp();
  const confirmation = useRef<ReturnType<typeof modal.confirm>>();
  const [failure, setFailure] = useState("");
  const operation = usePersonalOperation(true, "my-workspace");
  useLayoutEffect(() => {
    setFailure("");
    return () => confirmation.current?.destroy();
  }, [generation]);
  const logout = () => {
    const { isCurrent } = operation.capture();
    confirmation.current = modal.confirm({
      title: "退出登录",
      content: "确定退出当前账号？",
      onOk: async () => {
        if (!isCurrent()) return;
        try {
          await useUserStore.getState().userLogout();
        } catch (error) {
          if (isCurrent())
            setFailure(error instanceof Error ? error.message : "退出未完成，请重试。");
        }
      },
    });
  };
  if (relocated) return <Navigate to={relocated} replace />;
  return (
    <ConfigProvider theme={myTheme}>
      <main className="social-workspace my-workspace">
        <div className="my-workspace-body">
          <aside className="my-workspace-sidebar">
            <h1>我的</h1>
            <nav aria-label="我的栏目">
              {sectionGroups.map(({ label, items }) => (
                <div
                  key={label}
                  className="my-workspace-nav-group"
                  role="group"
                  aria-label={label}
                >
                  <span className="my-workspace-nav-label" aria-hidden="true">
                    {label}
                  </span>
                  {items.map(({ value, label: itemLabel, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      aria-current={view === value ? "page" : undefined}
                      onClick={() => setParams({ view: value })}
                    >
                      <Icon aria-hidden="true" />
                      <span>{itemLabel}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <select
              className="my-workspace-switcher"
              aria-label="我的栏目"
              value={view}
              onChange={(event) => setParams({ view: event.target.value })}
            >
              {sectionGroups.map(({ label, items }) => (
                <optgroup key={label} label={label}>
                  {items.map(({ value, label: itemLabel }) => (
                    <option key={value} value={value}>
                      {itemLabel}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button
              type="text"
              icon={<LogoutOutlined aria-hidden="true" />}
              className="my-workspace-logout"
              onClick={logout}
            >
              退出登录
            </Button>
          </aside>
          <section
            className={`my-workspace-content my-workspace-${view}`}
            key={`${generation}:${view}`}
            aria-label={section.label}
          >
            {failure && <Alert type="warning" message={failure} />}
            {view === "labs" ? (
              <LabWorkspace />
            ) : view === "capabilities" ? (
              <WorkbenchCapabilities view="lab" />
            ) : view === "models" ? (
              <ModelSettings open embedded onClose={() => navigate("/me")} />
            ) : view === "memory" ? (
              <PersonalMemoryPanel active inMyWorkspace />
            ) : view === "rules" ? (
              <PersonalRules />
            ) : view === "preferences" ? (
              <section className="my-preferences">
                <header className="my-section-heading">
                  <h2>通用设置</h2>
                  <p>语言与桌面使用习惯。</p>
                </header>
                <PersonalSettingsContent embedded />
              </section>
            ) : view === "version" ? (
              <>
                <header className="my-section-heading">
                  <h2>版本与帮助</h2>
                </header>
                <DesktopVersionPanel updates={updates} />
                <section className="my-about">
                  <h3>关于 {APP_NAME}</h3>
                  <p>面向教师、科研工作者与实验室团队的科研协作工具。</p>
                  <a
                    href="https://github.com/luoyan96/personal-agent/issues"
                    target="_blank"
                    rel="noreferrer"
                  >
                    反馈问题与建议
                  </a>
                  <details className="my-about-diagnostics">
                    <summary>头像素材署名</summary>
                    <p>
                      应用图标与私人助理「大肥鱼」头像：
                      <a
                        href="https://github.com/YunYueSama/codex-deepseek-pet"
                        target="_blank"
                        rel="noreferrer"
                      >
                        YunYueSama / codex-deepseek-pet
                      </a>
                    </p>
                  </details>
                  <details className="my-about-diagnostics">
                    <summary>版本详情与诊断</summary>
                    <AboutContent embedded />
                  </details>
                </section>
              </>
            ) : (
              <MyProfile />
            )}
          </section>
        </div>
      </main>
    </ConfigProvider>
  );
}
