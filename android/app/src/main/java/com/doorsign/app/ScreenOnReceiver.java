package com.doorsign.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

/**
 * Fired by an alarm at the schedule's on time. Briefly holds a wake lock that
 * turns the screen on; the sign (which shows over the lock screen) then sees
 * it is inside working hours and keeps the screen on itself.
 */
public class ScreenOnReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        PowerManager.WakeLock wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "DoorSign:scheduleWake");
        wl.acquire(15_000);
    }
}
