import * as moment from 'moment';
import {
  IOpdsAuthView,
  IOpdsCoverView,
  IOpdsFeedMetadataView,
  IOpdsGroupView,
  IOpdsLinkView,
  IOpdsNavigationLink,
  IOpdsNavigationLinkView,
  IOpdsPublicationView,
  IOpdsResultView,
  IOpdsTagView,
  IOpdsContributorView,
  IOpdsFacetView,
} from '../interface/opds';
import {convertMultiLangStringToString} from './tools/localisation';
import {ContentType} from '../utils/contentType';

import {IWithAdditionalJSON, TaJsonSerialize} from '@r2-lcp-js/serializable';
import {OPDSFeed} from '@r2-opds-js/opds/opds2/opds2';
import {OPDSAuthenticationDoc} from '@r2-opds-js/opds/opds2/opds2-authentication-doc';
import {OPDSFacet} from '@r2-opds-js/opds/opds2/opds2-facet';
import {OPDSGroup} from '@r2-opds-js/opds/opds2/opds2-group';
import {OPDSLink} from '@r2-opds-js/opds/opds2/opds2-link';
import {OPDSProperties} from '@r2-opds-js/opds/opds2/opds2-properties';
import {OPDSPublication} from '@r2-opds-js/opds/opds2/opds2-publication';
import {Contributor} from '@r2-shared-js/models/metadata-contributor';
import {Subject} from '@r2-shared-js/models/metadata-subject';

import {fallback} from './tools/fallback';
import {filterRelLink, filterTypeLink} from './tools/filterLink';
import {urlPathResolve} from './tools/resolveUrl';
import {TLinkMayBeOpds} from './type/link.type';
import {ILinkFilter} from './type/linkFilter.interface';

import {
  initGlobalConverters_GENERIC,
  initGlobalConverters_OPDS,
} from '@r2-opds-js/opds/init-globals';

initGlobalConverters_GENERIC();
initGlobalConverters_OPDS();

const debug = console.log;

const supportedFileTypeLinkArray = [
  ContentType.AudioBookPacked,
  ContentType.AudioBookPackedLcp,
  ContentType.Epub,
  ContentType.Lcp,
  ContentType.AudioBook,
  ContentType.webpub,
  ContentType.webpubPacked,
  ContentType.Json,
  ContentType.JsonLd,
  ContentType.pdf,
  ContentType.lcppdf,
];

export class OpdsFeedViewConverter {
  public convertOpdsTocToView(
    toc: TLinkMayBeOpds[],
    baseUrl: string
  ): IOpdsLinkView[] | undefined {
    return Array.isArray(toc)
      ? toc.map(l => this.convertLinkToView(l, baseUrl))
      : undefined;
  }

  public convertOpdsNavigationLinkToView(
    link: OPDSLink,
    baseUrl: string
  ): IOpdsNavigationLinkView {
    // Title could be defined on multiple lines
    // Only keep the first one
    const titleParts = link.Title?.split('\n').filter(text => text);
    const title = titleParts[0]?.trim() || '';
    const subtitle = titleParts[1]?.trim();

    return {
      title,
      subtitle,
      url: urlPathResolve(baseUrl, link.Href),
      numberOfItems: link.Properties && link.Properties.NumberOfItems,
    };
  }

  public convertOpdsTagToView(
    subject: Subject,
    baseUrl: string
  ): IOpdsTagView | undefined {
    return subject.Name || subject.Code
      ? {
          name: convertMultiLangStringToString(subject.Name || subject.Code),
          link: this.convertFilterLinksToView(baseUrl, subject.Links || [], {
            type: [ContentType.AtomXml, ContentType.Opds2],
          }),
        }
      : undefined;
  }

  public convertOpdsContributorToView(
    contributor: Contributor,
    baseUrl: string
  ): IOpdsContributorView | undefined {
    return contributor.Name
      ? {
          name:
            typeof contributor.Name === 'object'
              ? convertMultiLangStringToString(contributor.Name)
              : contributor.Name,
          link: this.convertFilterLinksToView(
            baseUrl,
            contributor.Links || [],
            {
              type: [ContentType.AtomXml, ContentType.Opds2],
            }
          ),
        }
      : undefined;
  }

  public convertLinkToView(ln: TLinkMayBeOpds, baseUrl: string): IOpdsLinkView {
    // transform to absolute url
    ln.Href = urlPathResolve(baseUrl, ln.Href);

    // safe copy on each filtered links
    return {
      url: ln.Href,
      title: ln.Title,
      type: ln.TypeLink,
      rel: ln.Rel && ln.Rel.length > 0 ? ln.Rel[0] : undefined,
      duration: ln.Duration,
      children: Array.isArray(ln.Children)
        ? ln.Children.map(l => this.convertLinkToView(l, baseUrl))
        : undefined,
    };
  }

  public filterLinks(links: TLinkMayBeOpds[] | undefined, filter: ILinkFilter) {
    const linksFiltered = links?.filter(ln => {
      if (
        !ln.Href &&
        (ln as unknown as IWithAdditionalJSON).AdditionalJSON?.link &&
        typeof (ln as unknown as IWithAdditionalJSON).AdditionalJSON?.link ===
          'string'
      ) {
        // yep, error in OPDS feed, "link" instead of "href"
        ln.Href = (ln as unknown as IWithAdditionalJSON).AdditionalJSON
          ?.link as string;
        debug(`OPDS LINK MONKEY PATCH: ${ln.Href}`);
      }

      let relFlag = false;
      let typeFlag = false;

      if (ln.Href) {
        relFlag = filterRelLink(ln, filter);
        typeFlag = filterTypeLink(ln, filter);
      }

      return filter.type && filter.rel
        ? relFlag && typeFlag
        : relFlag || typeFlag;
    });

    return linksFiltered || [];
  }
  public convertFilterLinksToView(
    baseUrl: string,
    links: TLinkMayBeOpds[] | undefined,
    filter: ILinkFilter
  ): IOpdsLinkView[] {
    const lns = this.filterLinks(links, filter);
    const view = lns.map(item => this.convertLinkToView(item, baseUrl));

    return view;
  }

  // warning: modifies r2OpdsPublication, makes relative URLs absolute with baseUrl!
  public convertOpdsPublicationToView(
    r2OpdsPublication: OPDSPublication,
    baseUrl: string
  ): IOpdsPublicationView {
    const metadata = r2OpdsPublication.Metadata;

    const numberOfPages = metadata.NumberOfPages;
    const workIdentifier = metadata.Identifier;
    const description = metadata.Description;
    const languages = metadata.Language;
    const title = convertMultiLangStringToString(metadata.Title);
    const publishedAt =
      metadata.PublicationDate &&
      moment(metadata.PublicationDate).toISOString();

    const authors = metadata.Author?.map(author =>
      this.convertOpdsContributorToView(author, baseUrl)
    ).filter((v): v is IOpdsContributorView => !!v);

    const publishers = metadata.Publisher?.map(publisher =>
      this.convertOpdsContributorToView(publisher, baseUrl)
    ).filter(v => !!v) as IOpdsContributorView[];

    const tags = metadata.Subject?.map(subject =>
      this.convertOpdsTagToView(subject, baseUrl)
    ).filter(v => !!v) as IOpdsTagView[];

    // CoverView object
    const coverLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Images,
      {
        rel: 'http://opds-spec.org/image',
      }
    );

    const thumbnailLinkView = fallback(
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Images, {
        type: ['image/png', 'image/jpeg'],
        rel: 'http://opds-spec.org/image/thumbnail',
      }),
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Images, {
        type: ['image/png', 'image/jpeg'],
      }),
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Images, {
        type: new RegExp('^image/*'),
      })
    );

    let cover: IOpdsCoverView | undefined;
    if (thumbnailLinkView) {
      cover = {
        thumbnailLinks: thumbnailLinkView,
        coverLinks: coverLinkView,
      };
    }

    // Get opds entry
    const sampleLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: [
          'http://opds-spec.org/acquisition/sample',
          'http://opds-spec.org/acquisition/preview',
        ],
        type: supportedFileTypeLinkArray,
      }
    );
    const acquisitionLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: [
          'http://opds-spec.org/acquisition',
          'http://opds-spec.org/acquisition/open-access',
        ],
        type: supportedFileTypeLinkArray,
      }
    );
    const buyLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: 'http://opds-spec.org/acquisition/buy',
      }
    );
    const borrowLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: 'http://opds-spec.org/acquisition/borrow',
      }
    );
    const subscribeLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: 'http://opds-spec.org/acquisition/subscribe',
      }
    );
    const entrylinkView = fallback(
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Links, {
        type: 'type=entry;profile=opds-catalog',
        rel: 'alternate',
      }),
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Links, {
        type: ContentType.Opds2Pub,
        rel: 'self',
      }),
      this.convertFilterLinksToView(baseUrl, r2OpdsPublication.Links, {
        type: [ContentType.AtomXml, ContentType.Opds2],
      })
    );

    const revokeLoanLinkView = this.convertFilterLinksToView(
      baseUrl,
      r2OpdsPublication.Links,
      {
        rel: ['http://librarysimplified.org/terms/rel/revoke'],
      }
    );

    const r2OpdsPublicationJson = TaJsonSerialize(r2OpdsPublication);
    const r2OpdsPublicationStr = JSON.stringify(r2OpdsPublicationJson);
    const r2OpdsPublicationBase64 =
      Buffer.from(r2OpdsPublicationStr).toString('base64');

    return {
      baseUrl,
      r2OpdsPublicationBase64,
      title,
      authors,
      publishers,
      workIdentifier,
      numberOfPages,
      description,
      tags,
      languages,
      publishedAt,
      cover,
      entryLinks: entrylinkView,
      buyLinks: buyLinkView,
      borrowLinks: borrowLinkView,
      subscribeLinks: subscribeLinkView,
      sampleOrPreviewLinks: sampleLinkView,
      openAccessLinks: acquisitionLinkView,
      revokeLoanLinks: revokeLoanLinkView,
    };
  }
  public convertOpdsAuthToView(
    r2OpdsAuth: OPDSAuthenticationDoc,
    baseUrl: string
  ): IOpdsResultView {
    const title = r2OpdsAuth.Title;
    let logoImageUrl = '';

    const logoLink = r2OpdsAuth.Links.find(
      l => l.Rel && l.Rel.includes('logo')
    );

    if (logoLink) {
      logoImageUrl = urlPathResolve(baseUrl, logoLink.Href);
    }

    const oauth = r2OpdsAuth.Authentication.find(
      a => a.Type === 'http://opds-spec.org/auth/oauth/password'
    );

    let labelLogin = '';
    let labelPassword = '';
    let oauthUrl = '';
    let oauthRefreshUrl = '';
    if (oauth) {
      if (oauth.Labels) {
        labelLogin = oauth.Labels.Login;
        labelPassword = oauth.Labels.Password;
      }
      if (oauth.Links) {
        const oauthLink = oauth.Links.find(
          l => l.Rel && l.Rel.includes('authenticate')
        );
        if (oauthLink) {
          oauthUrl = urlPathResolve(baseUrl, oauthLink.Href);
        }

        const oauthRefreshLink = oauth.Links.find(
          l => l.Rel && l.Rel.includes('refresh')
        );
        if (oauthRefreshLink) {
          oauthRefreshUrl = urlPathResolve(baseUrl, oauthRefreshLink.Href);
        }
      }
    }
    const auth: IOpdsAuthView = {
      logoImageUrl,

      labelLogin,
      labelPassword,

      oauthUrl,
      oauthRefreshUrl,
    };
    return {
      title,
      metadata: undefined,
      publications: [],
      navigation: undefined,
      links: undefined,
      groups: undefined,
      auth,
    };
  }

  public convertOpdsGroupToView(
    r2OpdsGroup: OPDSGroup,
    baseUrl: string
  ): IOpdsGroupView {
    const publications = r2OpdsGroup.Publications?.map(item =>
      // warning: modifies item, makes relative URLs absolute with baseUrl!
      this.convertOpdsPublicationToView(item, baseUrl)
    );

    const navigation = r2OpdsGroup.Navigation?.map(item =>
      this.convertOpdsNavigationLinkToView(item, baseUrl)
    );

    const [lnFiltered] = this.filterLinks(r2OpdsGroup.Links, {
      rel: 'self',
    });

    const title = r2OpdsGroup.Metadata?.Title
      ? convertMultiLangStringToString(r2OpdsGroup.Metadata.Title)
      : '';

    const nb = r2OpdsGroup.Metadata?.NumberOfItems;

    const selfLink = new OPDSLink();
    selfLink.Title = title;
    selfLink.Properties = new OPDSProperties();
    selfLink.Properties.NumberOfItems = nb;
    selfLink.Rel = lnFiltered?.Rel || undefined;
    selfLink.Href = lnFiltered?.Href;

    const ret: IOpdsGroupView = {
      publications,
      navigation,
      selfLink: this.convertOpdsNavigationLinkToView(selfLink, baseUrl),
    };
    return ret;
  }

  public convertOpdsFacetsToView(
    r2OpdsFacet: OPDSFacet,
    baseUrl: string
  ): IOpdsFacetView {
    const title = r2OpdsFacet.Metadata?.Title
      ? convertMultiLangStringToString(r2OpdsFacet.Metadata.Title)
      : '';

    const links = r2OpdsFacet.Links?.map(item =>
      this.convertOpdsNavigationLinkToView(item, baseUrl)
    );

    const ret: IOpdsFacetView = {
      title,
      links,
    };
    return ret;
  }

  public convertOpdsFeedToView(
    r2OpdsFeed: OPDSFeed,
    baseUrl: string
  ): IOpdsResultView {
    const title = convertMultiLangStringToString(r2OpdsFeed.Metadata?.Title);
    const publications = r2OpdsFeed.Publications?.map(item =>
      // warning: modifies item, makes relative URLs absolute with baseUrl!
      this.convertOpdsPublicationToView(item, baseUrl)
    );
    const navigation = r2OpdsFeed.Navigation?.map(item =>
      this.convertOpdsNavigationLinkToView(item, baseUrl)
    );

    const groups = r2OpdsFeed.Groups?.map(item =>
      this.convertOpdsGroupToView(item, baseUrl)
    );

    const facets = r2OpdsFeed.Facets?.map(item =>
      this.convertOpdsFacetsToView(item, baseUrl)
    );

    const links: IOpdsNavigationLink | undefined = r2OpdsFeed.Links && {
      next: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'next',
      }),
      previous: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'previous',
      }),
      first: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'first',
      }),
      last: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'last',
      }),
      start: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'start',
      }),
      up: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {rel: 'up'}),
      search: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'search',
      }),
      bookshelf: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'http://opds-spec.org/shelf',
      }),
      text: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        type: [ContentType.Html],
      }),
      self: this.convertFilterLinksToView(baseUrl, r2OpdsFeed.Links, {
        rel: 'self',
      }),
    };
    const metadata: IOpdsFeedMetadataView | undefined = r2OpdsFeed.Metadata
      ? {
          numberOfItems:
            typeof r2OpdsFeed.Metadata.NumberOfItems === 'number'
              ? r2OpdsFeed.Metadata.NumberOfItems
              : undefined,
          itemsPerPage:
            typeof r2OpdsFeed.Metadata.ItemsPerPage === 'number'
              ? r2OpdsFeed.Metadata.ItemsPerPage
              : undefined,
          currentPage:
            typeof r2OpdsFeed.Metadata.CurrentPage === 'number'
              ? r2OpdsFeed.Metadata.CurrentPage
              : undefined,
        }
      : undefined;

    return {
      title,
      metadata,
      publications,
      navigation,
      links,
      groups,
      facets,
      auth: undefined,
    };
  }
}
