import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { filterByDate, formatDateLabel, monthName } from '../archive';
import { ArchiveCalendar, resolveSelection } from '../components/ArchiveCalendar';
import { ArchiveMetrics } from '../components/ArchiveMetrics';
import { ImageGrid } from '../components/ImageGrid';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { fetchImageIndex } from '../content';
import { useAsyncData } from '../hooks';
import type { ImageSummary } from '../types';

type ImageParams = {
  year?: string;
  month?: string;
  day?: string;
  imageId?: string;
};

export function ImagesPage() {
  const params = useParams<ImageParams>();
  const state = useAsyncData(fetchImageIndex, []);

  if (state.status === 'loading') {
    return <LoadingState label="Loading images" />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  const index = state.data;
  const calendarSelection = resolveSelection(index.years, params.year, params.month);
  const scopedImages = filterByDate(index.images, params);
  const selectedImage = scopedImages.find((image) => image.id === params.imageId);
  const shouldShowImages = Boolean(params.day);
  const shouldShowRootGroups = !params.year;
  const shouldShowYearGroups = Boolean(params.year && !params.month);
  const shouldShowMonthGroups = Boolean(params.year && params.month && !params.day);
  const rootGroups = shouldShowRootGroups ? groupImagesByYear(scopedImages) : [];
  const yearGroups = shouldShowYearGroups ? groupImagesByMonth(scopedImages) : [];
  const monthGroups = shouldShowMonthGroups ? groupImagesByDay(scopedImages) : [];

  return (
    <main className="page page--archive">
      <div className="archive-rail archive-rail--left">
        <ArchiveCalendar
          basePath="/images"
          label="Image Archive"
          years={index.years}
          selectedYear={calendarSelection?.year.year}
          selectedMonth={calendarSelection?.month.month}
          selectedDay={params.day}
        />
      </div>

      <section className="archive-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Images</p>
            <h1>{pageTitle(params, scopedImages.length)}</h1>
          </div>
          <Link className="quiet-link" to="/images">
            Reset
          </Link>
        </div>

        {params.year && !selectedImage ? <ImageBreadcrumb params={params} /> : null}

        {!shouldShowImages && !shouldShowRootGroups && !shouldShowYearGroups && !shouldShowMonthGroups ? (
          <div className="archive-summary">
            <strong>{scopedImages.length.toLocaleString()}</strong>
            <span>{scopedImages.length === 1 ? 'image' : 'images'}</span>
          </div>
        ) : null}

        {shouldShowRootGroups ? (
          <ImageGroups groups={rootGroups} emptyText="No images found." previewLimit={12} />
        ) : null}

        {shouldShowYearGroups ? (
          <ImageGroups groups={yearGroups} emptyText="No images found for this year." previewLimit={12} />
        ) : null}

        {shouldShowMonthGroups ? (
          <ImageGroups groups={monthGroups} emptyText="No images found for this month." />
        ) : null}

        {selectedImage ? (
          <section className="image-viewer">
            <ImageBreadcrumb params={params} imageTitle={selectedImage.title} />
            <img src={selectedImage.rawUrl} alt={selectedImage.title} />
          </section>
        ) : null}

        {shouldShowImages ? (
          <ImageGrid images={scopedImages} selectedId={params.imageId} />
        ) : null}
      </section>

      <aside className="archive-rail archive-rail--right">
        <ArchiveMetrics />
      </aside>
    </main>
  );
}

type ImageGroup = {
  key: string;
  label: string;
  href: string;
  images: ImageSummary[];
};

function ImageGroups({
  groups,
  emptyText,
  previewLimit,
}: {
  groups: ImageGroup[];
  emptyText: string;
  previewLimit?: number;
}) {
  if (groups.length === 0) {
    return <p className="state-text">{emptyText}</p>;
  }

  return (
    <div className="image-groups">
      {groups.map((group) => (
        <ImageGroupCarousel group={group} previewLimit={previewLimit} key={group.key} />
      ))}
    </div>
  );
}

function ImageGroupCarousel({ group, previewLimit }: { group: ImageGroup; previewLimit?: number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    containScroll: false,
    dragFree: false,
    loop: group.images.length > 2,
    skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const previewImages = previewLimit ? group.images.slice(0, previewLimit) : group.images;
  const remainingCount = group.images.length - previewImages.length;

  const updateSelection = useCallback(() => {
    setSelectedIndex(emblaApi?.selectedScrollSnap() ?? 0);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    updateSelection();
    emblaApi.on('select', updateSelection);
    emblaApi.on('reInit', updateSelection);

    return () => {
      emblaApi.off('select', updateSelection);
      emblaApi.off('reInit', updateSelection);
    };
  }, [emblaApi, updateSelection]);

  return (
    <section className="image-group">
      <div className="image-group__header">
        <div>
          <Link to={group.href}>{group.label}</Link>
          <span>{group.images.length === 1 ? '1 image' : `${group.images.length} images`}</span>
        </div>
        <div className="image-group__controls">
          <button type="button" title={`Previous ${group.label} images`} onClick={() => emblaApi?.scrollPrev()}>
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button type="button" title={`Next ${group.label} images`} onClick={() => emblaApi?.scrollNext()}>
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>
      <div className="image-group__viewport" ref={emblaRef}>
        <div className="image-group__track">
          {previewImages.map((image, index) => (
            <div className={slideClass(index, selectedIndex)} key={image.id}>
              <Link className="image-group__slide-link" to={image.route} title={image.title}>
                <img src={image.thumbUrl} alt={image.title} loading="lazy" />
              </Link>
            </div>
          ))}
          {remainingCount > 0 ? (
            <div className={slideClass(previewImages.length, selectedIndex)}>
              <Link className="image-group__more" to={group.href}>
                +{remainingCount.toLocaleString()}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function slideClass(index: number, selectedIndex: number) {
  const distance = Math.abs(index - selectedIndex);

  if (distance === 0) {
    return 'image-group__slide image-group__slide--active';
  }

  if (distance === 1) {
    return index < selectedIndex
      ? 'image-group__slide image-group__slide--near image-group__slide--before'
      : 'image-group__slide image-group__slide--near image-group__slide--after';
  }

  return 'image-group__slide image-group__slide--far';
}

function groupImagesByYear(images: ImageSummary[]): ImageGroup[] {
  return groupImages(images, (image) => ({
    key: image.year,
    label: image.year,
    href: `/images/${image.year}`,
  }));
}

function groupImagesByMonth(images: ImageSummary[]): ImageGroup[] {
  return groupImages(images, (image) => ({
    key: `${image.year}-${image.month}`,
    label: monthName(image.year, image.month),
    href: `/images/${image.year}/${image.month}`,
  }));
}

function groupImagesByDay(images: ImageSummary[]): ImageGroup[] {
  return groupImages(images, (image) => ({
    key: `${image.year}-${image.month}-${image.day}`,
    label: formatDateLabel(`${image.year}-${image.month}-${image.day}T00:00:00`),
    href: `/images/${image.year}/${image.month}/${image.day}`,
  }));
}

function groupImages(
  images: ImageSummary[],
  getGroup: (image: ImageSummary) => Pick<ImageGroup, 'key' | 'label' | 'href'>,
): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();

  for (const image of images) {
    const group = getGroup(image);

    if (!groups.has(group.key)) {
      groups.set(group.key, {
        ...group,
        images: [],
      });
    }

    groups.get(group.key)!.images.push(image);
  }

  return [...groups.values()];
}

function ImageBreadcrumb({ params, imageTitle }: { params: ImageParams; imageTitle?: string }) {
  if (!params.year) {
    return null;
  }

  return (
    <nav className="image-breadcrumb" aria-label="Image archive location">
      <Link to="/images">Images</Link>
      {params.month ? <Link to={`/images/${params.year}`}>{params.year}</Link> : <span>{params.year}</span>}
      {params.month && params.day ? (
        <Link to={`/images/${params.year}/${params.month}`}>{monthName(params.year, params.month)}</Link>
      ) : null}
      {params.month && !params.day ? <span>{monthName(params.year, params.month)}</span> : null}
      {params.year && params.month && params.day && !imageTitle ? (
        <span>{formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)}</span>
      ) : null}
      {params.year && params.month && params.day && imageTitle ? (
        <>
          <Link to={`/images/${params.year}/${params.month}/${params.day}`}>
            {formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)}
          </Link>
          <span>{imageTitle}</span>
        </>
      ) : null}
    </nav>
  );
}

function pageTitle(params: ImageParams, count: number) {
  if (params.year && params.month && params.day) {
    return `${formatDateLabel(`${params.year}-${params.month}-${params.day}T00:00:00`)} (${count})`;
  }

  if (params.year && params.month) {
    return `${monthName(params.year, params.month)} (${count})`;
  }

  if (params.year) {
    return `${params.year} (${count})`;
  }

  return `All Images (${count})`;
}
