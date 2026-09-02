import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class Msg91WidgetService {
  /**
   * Opens the MSG91-hosted OTP popup (phone entry, OTP send, and OTP verification
   * are all handled inside MSG91's own UI). Waits for the SDK script (loaded in
   * index.html) if it hasn't finished loading yet.
   */
  triggerLogin(onSuccess: (data: any) => void, onFailure: (error: any) => void): void {
    const start = () => {
      if (typeof (window as any).initSendOTP !== 'function') {
        console.warn('MSG91 widget script not loaded. Make sure the MSG91 SDK is included in index.html');
        onFailure({ message: 'OTP service is not ready. Please try again.' });
        return;
      }

      const configuration = {
        widgetId: environment.msg91.widgetId,
        tokenAuth: environment.msg91.tokenAuth,
        success: onSuccess,
        failure: onFailure,
      };

      (window as any).initSendOTP(configuration);
    };

    if (typeof (window as any).initSendOTP === 'function') {
      start();
    } else {
      window.addEventListener('msg91-script-loaded', start, { once: true });
    }
  }
}
