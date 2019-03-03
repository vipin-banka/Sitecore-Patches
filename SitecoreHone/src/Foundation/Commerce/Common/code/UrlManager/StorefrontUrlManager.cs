using Sitecore.Commerce.XA.Foundation.Common.Context;
using Sitecore.Commerce.XA.Foundation.Common.UrlManager;
using System;
using System.Globalization;

namespace SitecoreHone.Commerce.XA.Foundation.Common.UrlManager
{
    public class StorefrontUrlManager : Sitecore.Commerce.XA.Foundation.Common.UrlManager.StorefrontUrlManager
    {
        public StorefrontUrlManager(ISiteContext siteContext) : base(siteContext)
        {
            this.SiteContext = siteContext;
        }

        public override UrlBuilder GetStorefrontUrl(string url)
        {
            if (Uri.IsWellFormedUriString(url, UriKind.Absolute))
                return new UrlBuilder(new Uri(url));

            string relativeUri = string.Format(CultureInfo.InvariantCulture, "/{0}", url.Trim('/'));
            if (!string.IsNullOrEmpty(this.SiteContext.VirtualFolder.Trim('/')))
            {
                if (!(relativeUri + "/").StartsWith(string.Format(CultureInfo.InvariantCulture, "/{0}/", this.SiteContext.VirtualFolder.Trim('/')), StringComparison.OrdinalIgnoreCase))
                    relativeUri = string.Format(CultureInfo.InvariantCulture, "/{0}/{1}", this.SiteContext.VirtualFolder.Trim('/'), relativeUri.Trim('/'));
            }
            if (this.IncludeLanguage)
                relativeUri = string.Format(CultureInfo.InvariantCulture, "/{0}/{1}", Sitecore.Context.Language.Name, relativeUri.Trim('/'));
            string hostName = Sitecore.Context.Site.HostName;
            return new UrlBuilder(new Uri(new Uri(!this.IsValidHostName(hostName) ? string.Format(CultureInfo.InvariantCulture, "{0}://{1}", CurrentUrl.Scheme, CurrentUrl.Host) : string.Format(CultureInfo.InvariantCulture, "{0}://{1}", CurrentUrl.Scheme, hostName)), relativeUri));
        }

        protected virtual bool IsValidHostName(string hostName)
        {
            if (string.IsNullOrEmpty(hostName) || hostName.Contains("*"))
                return false;
            return !hostName.Contains("|");
        }
    }
}