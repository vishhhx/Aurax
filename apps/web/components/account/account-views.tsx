"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { KeyRoundIcon, LaptopIcon, MailIcon, ShieldIcon, SmartphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Badge } from "@/components/ui/badge"
import { DetailList, Panel } from "@/components/common/page"
import { EmptyState, Unavailable } from "@/components/common/states"
import { useAuth } from "@/hooks/use-account"
import { useAppDispatch, useAppSelector } from "@/hooks/useRedux"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/api/types"
import { formatDateTime, formatTime } from "@/lib/format"
import { DEFAULT_PREFERENCES, preferencesStore, updatePreferences } from "@/lib/stores/preferences"
import { signOut } from "@/store/slices/auth"
import { clearNotifications } from "@/store/slices/notifications"
import { cn } from "@/lib/utils"

const PROVIDER = { google: "Google", github: "GitHub", local: "Email" } as const

function usePrefs() {
  return useSyncExternalStore(preferencesStore.subscribe, preferencesStore.get, () => DEFAULT_PREFERENCES)
}

function SettingRow({ title, description, control, id }: { title: string; description: string; control: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function DeviceNote() {
  return <p className="px-5 pb-4 text-xs text-muted-foreground">Saved in this browser only; Aurax has no server-side preferences yet.</p>
}

export function ProfileView() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Profile" bodyClassName="p-5">
        <DetailList
          items={[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            {
              label: "Email verification",
              value: user.isEmailVerified ? <Badge variant="outline" className="rounded-md border-up/30 text-up">Verified by {PROVIDER[user.provider]}</Badge> : <Badge variant="outline" className="rounded-md">Not verified</Badge>,
            },
            { label: "Sign-in method", value: PROVIDER[user.provider] },
            { label: "Member since", value: <span className="num">{formatDateTime(user.createdAt)}</span> },
            { label: "Last sign-in", value: <span className="num">{formatDateTime(user.lastLogin)}</span> },
            { label: "User ID", value: <span className="num text-xs">{user.userId}</span> },
          ]}
        />
      </Panel>
      <Unavailable
        title="Edit profile"
        description={`Your name and email come from your ${PROVIDER[user.provider]} account and cannot be changed in Aurax yet. Changes made at ${PROVIDER[user.provider]} can take up to an hour to appear.`}
        className="py-6"
      />
    </div>
  )
}

export function SecurityView() {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { user } = useAuth()
  if (!user) return null
  const provider = PROVIDER[user.provider]
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Sign-in" bodyClassName="divide-y">
        <SettingRow
          title={`${provider} account`}
          description={`You sign in to Aurax with ${user.email} through ${provider}. Protect that account with a strong password and two-step verification at ${provider}.`}
          control={<Badge variant="outline" className="rounded-md">Connected</Badge>}
        />
        <SettingRow title="Password" description="Aurax accounts have no separate password while sign-in is via Google or GitHub." control={<Badge variant="outline" className="rounded-md text-muted-foreground">Not applicable</Badge>} />
      </Panel>

      <Unavailable icon={ShieldIcon} title="Two-factor authentication" description="Authenticator-app (TOTP) verification for Aurax sign-in and sensitive actions is not available yet." className="py-6" />

      <Panel title="Sessions">
        <ul className="divide-y">
          <li className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="flex items-center gap-3">
              <LaptopIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-sm font-medium">This browser</span>
                <span className="text-xs text-muted-foreground">Current session</span>
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={() => void dispatch(signOut()).then(() => router.replace("/login"))}>
              Sign out
            </Button>
          </li>
        </ul>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          A list of other signed-in devices and &quot;sign out everywhere&quot; are not available yet. Signing out revokes this browser&apos;s session immediately; an already-issued access token expires within 15 minutes.
        </p>
      </Panel>
    </div>
  )
}

export function ApiKeysView() {
  return <Unavailable icon={KeyRoundIcon} title="API keys" description="Programmatic trading keys are not available yet. Aurax can only be used through this web app for now." />
}

export function NotificationsView() {
  const dispatch = useAppDispatch()
  const prefs = usePrefs()
  const items = useAppSelector((s) => s.notifications.items)
  return (
    <div className="flex flex-col gap-4">
      <Panel title="In-app alerts">
        <div className="divide-y">
          <SettingRow
            id="pref-fill-toasts"
            title="Fill alerts"
            description="Show a toast when an order fills or partially fills. Cancellations, rejections and deposits always alert."
            control={<Switch id="pref-fill-toasts" checked={prefs.fillToasts} onCheckedChange={(v) => updatePreferences({ fillToasts: v })} />}
          />
        </div>
        <DeviceNote />
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Unavailable icon={MailIcon} title="Email notifications" description="Aurax does not send email notifications yet." className="py-6" />
        <Unavailable icon={SmartphoneIcon} title="Push notifications" description="Mobile and browser push notifications are not available yet." className="py-6" />
      </div>

      <Panel
        title="Activity this session"
        actions={
          items.length ? (
            <Button variant="ghost" size="xs" onClick={() => dispatch(clearNotifications())}>
              Clear
            </Button>
          ) : null
        }
      >
        {items.length === 0 ? (
          <EmptyState title="No activity yet" description="Order, fill and deposit events received while this tab is open appear here. There is no notification history on the server." className="py-6" />
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href ?? "#"} className="flex items-start justify-between gap-4 px-5 py-3 hover:bg-muted/50">
                  <span className="flex flex-col gap-0.5">
                    <span className={cn("text-sm font-medium", n.tone === "error" && "text-down", n.tone === "success" && "text-up")}>{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.description}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{formatTime(n.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function PreferencesView() {
  const prefs = usePrefs()
  const { theme, setTheme } = useTheme()
  return (
    <Panel title="Preferences">
      <div className="divide-y">
        <SettingRow
          title="Theme"
          description="Dark, light, or follow your system. Press D anywhere outside a text field to switch."
          control={
            <ToggleGroup type="single" variant="outline" size="sm" value={theme ?? "dark"} onValueChange={(v) => v && setTheme(v)} aria-label="Theme">
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="system">System</ToggleGroupItem>
            </ToggleGroup>
          }
        />
        <SettingRow
          id="pref-confirm"
          title="Confirm orders"
          description="Ask for confirmation before each order is sent."
          control={<Switch id="pref-confirm" checked={prefs.confirmOrders} onCheckedChange={(v) => updatePreferences({ confirmOrders: v })} />}
        />
        <SettingRow
          id="pref-interval"
          title="Default chart interval"
          description="Candle interval the trading chart opens with."
          control={
            <Select value={prefs.chartInterval} onValueChange={(v) => updatePreferences({ chartInterval: v as CandleInterval })}>
              <SelectTrigger id="pref-interval" size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CANDLE_INTERVALS.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
        <SettingRow
          title="Favourite markets"
          description={prefs.favorites.length ? prefs.favorites.join(", ") : "Star markets in the explorer or the market selector."}
          control={
            <Button variant="outline" size="sm" disabled={!prefs.favorites.length} onClick={() => updatePreferences({ favorites: [] })}>
              Clear
            </Button>
          }
        />
      </div>
      <DeviceNote />
    </Panel>
  )
}
