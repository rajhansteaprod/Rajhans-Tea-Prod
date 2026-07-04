@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  trackPageView(url: string) {
    gtag('config', 'G-16DFYCDSY5', {
      page_path: url
    });
  }

  trackEvent(name: string, params: any = {}) {
    gtag('event', name, params);
  }
}