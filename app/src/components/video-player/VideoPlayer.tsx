import { useOutsideClick } from "@/hooks/useOutsideClick";
import formatDuration from "@/utils/formatDuration";
import getThumbnails from "@/utils/getThumbnails";
import {
    ChangeEvent,
    MouseEvent,
    SyntheticEvent,
    TouchEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import deleteImages from "../../utils/deleteImages";
import ListItem from "../ListItem";
import VideoFullClose from "../icons/VideoFullClose";
import VideoFullOpen from "../icons/VideoFullOpen";
import VideoPausedIcon from "../icons/VideoPausedIcon";
import VideoPlayIcon from "../icons/VideoPlayIcon";
import VolumeHighIcon from "../icons/VolumeHighIcon";
import VolumeLowIcon from "../icons/VolumeLowIcon";
import VolumeMutedIcon from "../icons/VolumeMutedIcon";
import ControlButton from "./ControlButton";
import { VideoType } from "@/models/Video";

//type support for different browsers
declare global {
    interface Document {
        webkitCurrentFullScreenElement: any;
        webkitCancelFullScreen: () => void;
        webkitFullscreenElement: any;
        webkitExitFullscreen: () => void;
    }
    interface HTMLElement {
        webkitRequestFullscreen: () => void;
        webkitEnterFullscreen: () => void;
        msRequestFullscreen: () => void;
    }
}

const VideoPlayer = ({
    type,
    video,
}: {
    type: "normal" | "embed";
    video: VideoType;
}) => {
    const [popup, setPopup] = useState(false);
    const [loading, setLoading] = useState(false);
    const [paused, setPaused] = useState(true);
    const [time, setTime] = useState("0:00");
    const [volumeLevel, setVolumeLevel] = useState("high");
    const [speed, setSpeed] = useState(1);
    const [quality, setQuality] = useState<number>();
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const isScrubbingRef = useRef(false);
    const previewImgRef = useRef<HTMLImageElement>(null);
    const thumbnailImgRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bufferedRef = useRef<HTMLDivElement>(null);
    const volumeSliderRef = useRef<HTMLInputElement>(null);
    const qualityRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const wasPaused = useRef<boolean | undefined>(undefined);
    const thumbnails = useRef<string[]>([]);

    const qualityList = [480, 720, 1080];
    useOutsideClick([qualityRef], () => {
        setPopup(false);
    });

    useEffect(() => {
        setLoading(true);
    }, [video.url, quality]);

    useEffect(() => {
        // thumbnails
        getThumbnails(video.url).then((r) => {
            thumbnails.current = r;
        });
        // event listeners to track scrubbing off the video element
        const handleMouseUp = (e: any) => {
            if (isScrubbingRef.current) toggleScrubbing(e);
        };
        const handleMove = (e: any) => {
            if (isScrubbingRef.current) handleTimelineUpdate(e);
        };
        const keyboardHandler = (e: KeyboardEvent) => {
            const tagName = document.activeElement?.tagName.toLowerCase();

            if (tagName === "input") return;

            switch (e.key.toLowerCase()) {
                case " ":
                    if (tagName === "button") return;
                case "k":
                    togglePlay();
                    break;
                case "m":
                    toggleMute();
                    break;
                case "arrowleft":
                case "j":
                    skip(-5);
                    break;
                case "arrowright":
                case "l":
                    skip(5);
                    break;
            }
        };
        if (type === "normal") {
            document.addEventListener("keydown", keyboardHandler);
        }
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousemove", handleMove);

        // add (default)
        setQuality(Number(localStorage.getItem("vo-quality")) || 1080);
        if (videoRef.current) {
            videoRef.current.volume =
                Number(localStorage.getItem("vo-volume")) ?? 0.5;
        }
        return () => {
            // delete blobs
            deleteImages(thumbnails.current);
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("mousemove", handleMove);
            if (type === "normal") {
                document.removeEventListener("keydown", keyboardHandler);
            }
        };
    }, []);

    // dirty solution to deal with event document event listeners
    function updateIsScrubbing(value: boolean) {
        setIsScrubbing(value);
        isScrubbingRef.current = value;
    }
    //
    function handleLoadStart() {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = Number(localStorage.getItem("vo-speed")) || 1;
        setTime(formatDuration(video.currentTime));
        setSpeed(video.playbackRate);
    }
    // intial setup on video data loaded
    async function handleLoadedData() {
        const video = videoRef.current;
        const timelineContainer = timelineRef.current;
        if (!video) return;
        if (!timelineContainer) return;
        setLoading(false);
        const percent = timelineContainer.style.getPropertyValue(
            "--progress-position"
        );
        video.currentTime = Number(percent) * video.duration;
        // if video was not paused before -> play it
        if (wasPaused.current === false) await playVideo();
    }
    // update displayed time
    function handleTimeUpdate() {
        const video = videoRef.current;
        const timelineContainer = timelineRef.current;
        if (!video) return;
        if (!timelineContainer) return;
        if (!video.duration) return;
        if (loading) return;
        setTime(formatDuration(video.currentTime) || "0:00");
        const percent = video.currentTime / video.duration;

        timelineContainer.style.setProperty(
            "--progress-position",
            percent.toString()
        );

        updateBufferRange();
    }
    // update timeline
    function handleTimelineUpdate(
        e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>
    ) {
        const previewImg = previewImgRef.current;
        const thumbnailImg = thumbnailImgRef.current;
        const timelineContainer = timelineRef.current;

        if (!timelineContainer) return;
        if (!previewImg) return;
        if (!thumbnailImg) return;
        if (!thumbnails.current) return;

        let x = 0;
        if ("touches" in e) {
            x = e.targetTouches[0].pageX;
        } else if ("pageX" in e) {
            x = e.pageX;
        }

        const scrubbing = isScrubbingRef.current;
        const rect = timelineContainer.getBoundingClientRect();
        const percent =
            Math.min(Math.max(0, x - rect.x), rect.width) / rect.width;

        //thumbnail image
        if (thumbnails.current) {
            const previewImgSrc = thumbnails.current[Math.floor(percent * 100)];
            if (previewImgSrc) {
                previewImgRef.current.src = previewImgSrc;
                if (scrubbing) {
                    thumbnailImgRef.current.src = previewImgSrc;
                }
            }
        }
        const previewX =
            x + previewImg.offsetWidth / 2 > rect.right
                ? rect.right - previewImg.offsetWidth / 2
                : x - previewImg.offsetWidth / 2 < rect.left
                ? rect.left + previewImg.offsetWidth / 2
                : x;
        const previewPercent =
            Math.min(Math.max(0, previewX - rect.x), rect.width) / rect.width;
        timelineContainer.style.setProperty(
            "--preview-position",
            previewPercent.toString()
        );
        if (scrubbing) {
            if (x) e.preventDefault();
            timelineContainer.style.setProperty(
                "--progress-position",
                percent.toString()
            );
        }
    }
    // scrubbing via mouse
    async function toggleScrubbing(e: MouseEvent<HTMLDivElement>) {
        const video = videoRef.current;
        const timelineContainer = timelineRef.current;
        if (!video) return;
        if (!timelineContainer) return;
        if (!video.duration) return;
        if (loading) return;

        const rect = timelineContainer.getBoundingClientRect();
        const percent =
            Math.min(Math.max(0, e.pageX - rect.x), rect.width) / rect.width;
        const scrubbing = (e.buttons & 1) === 1;

        updateIsScrubbing(scrubbing);
        if (scrubbing) {
            wasPaused.current = video.paused;
            pauseVideo();
        } else {
            video.currentTime = percent * video.duration;
            if (wasPaused.current === false) await playVideo();
        }
        handleTimelineUpdate(e);
    }
    // scrubbing via touchpad
    async function handleTouchStartScrubbing(e: TouchEvent<HTMLDivElement>) {
        const video = videoRef.current;
        const timelineContainer = timelineRef.current;
        if (!video) return;
        if (!timelineContainer) return;
        if (e.targetTouches.length > 1) return;
        if (!video.duration) return;
        if (loading) return;
        const rect = timelineContainer.getBoundingClientRect();
        let percent =
            Math.min(
                Math.max(0, e.targetTouches[0].pageX - rect.x),
                rect.width
            ) / rect.width;
        updateIsScrubbing(true);

        document.ontouchmove = function () {
            percent =
                Math.min(
                    Math.max(0, e.targetTouches[0].pageX - rect.x),
                    rect.width
                ) / rect.width;
            wasPaused.current = video.paused;
            pauseVideo();
            handleTimelineUpdate(e);
        };
        document.ontouchend = document.ontouchcancel = async function () {
            video.currentTime = percent * video.duration;
            if (wasPaused.current === false) await playVideo();
            updateIsScrubbing(false);
            //remove event listeners
            document.ontouchend =
                document.ontouchcancel =
                document.ontouchmove =
                    null;
        };
    }
    /* EVENT HANDLERS */
    async function handleVideoClick() {
        const video = videoRef.current;
        if (!video) return;
        if (!video.duration) return;
        if (loading) return;
        video.paused ? await playVideo() : pauseVideo();
    }
    // volume
    function handleSliderInput(e: ChangeEvent<HTMLInputElement>) {
        const video = videoRef.current;
        if (!video) return;
        const value = +e.target.value;
        video.volume = value;
        video.muted = value === 0;
    }
    function handleMute() {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
    }
    function handleVolumeChange(e: SyntheticEvent<HTMLVideoElement>) {
        const video = e.currentTarget;
        if (!volumeSliderRef?.current) return;
        volumeSliderRef.current.value = video.volume.toString();
        volumeSliderRef.current.style.background = `linear-gradient(90deg, white ${
            video.volume * 100
        }%, rgb(120 113 108 / 0.5) 0%)`;

        if (video.muted || video.volume === 0) {
            volumeSliderRef.current.value = "0";
            setVolumeLevel("muted");
        } else if (video.volume >= 0.5) {
            setVolumeLevel("high");
        } else {
            setVolumeLevel("low");
        }
        localStorage.setItem("vo-volume", volumeSliderRef.current.value);
    }
    // full screen button
    function handleFullScreen() {
        const videoPlayer = document.getElementById("video-player");
        if (!videoPlayer) return;

        setIsFullScreen(false);
        // Exit full screen
        if (document.fullscreenElement == videoPlayer) {
            document.exitFullscreen();
            return;
        }
        /* IOS */
        if (document.webkitCurrentFullScreenElement == videoPlayer) {
            document.webkitCancelFullScreen();
            return;
        }
        if (document.webkitFullscreenElement == videoPlayer) {
            document.webkitExitFullscreen();
            return;
        }
        // Enter Full screen
        setIsFullScreen(true);
        if (videoPlayer.requestFullscreen) {
            videoPlayer.requestFullscreen();
        } else if (videoPlayer.webkitRequestFullscreen) {
            /* IOS */
            videoPlayer.webkitRequestFullscreen();
        } else if (videoPlayer.webkitEnterFullscreen) {
            videoPlayer.webkitEnterFullscreen();
        } else if (videoPlayer.msRequestFullscreen) {
            /* IE11 */
            videoPlayer.msRequestFullscreen();
        }
    }
    // playback speed Button
    function handleSpeed() {
        const video = videoRef.current;
        if (!video) return;
        let newPlaybackRate = video.playbackRate + 0.25;
        if (newPlaybackRate > 2) newPlaybackRate = 0.25;
        video.playbackRate = newPlaybackRate;
        setSpeed(newPlaybackRate);
        localStorage.setItem("vo-speed", newPlaybackRate.toString());
    }
    // quality select one of the list items
    function handleQualitySelect(i: number) {
        if (!videoRef.current) return;
        wasPaused.current = videoRef.current.paused;
        localStorage.setItem("vo-quality", i.toString());
        setQuality(i);
        setPopup(false);
    }
    /* UTILITY FUNCTIONS */
    async function playVideo() {
        try {
            await videoRef.current?.play();
            setPaused(false);
        } catch (error) {}
    }
    function pauseVideo() {
        videoRef.current?.pause();
        setPaused(true);
    }
    async function togglePlay() {
        if (!videoRef.current) return;
        if (!videoRef.current.duration) return;
        videoRef.current.paused ? await playVideo() : pauseVideo();
    }
    function toggleMute() {
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
    }
    function skip(duration: number) {
        if (!videoRef.current) return;
        videoRef.current.currentTime += duration;
    }
    function updateBufferRange() {
        const video = videoRef.current;
        if (!video) return;
        const bufferRange = video.buffered;
        const bufferedSegment = bufferedRef.current;
        if (!bufferedSegment) return;
        if (bufferRange.length === 0) {
            bufferedSegment.style.left = "0%";
            bufferedSegment.style.width = "100%";
            return;
        }
        // check current position of playback
        let bufferIndex = bufferRange.start(0);
        for (let i = 0; i < bufferRange.length; i++) {
            if (
                video.currentTime >= bufferRange.start(i) &&
                video.currentTime < bufferRange.end(i)
            ) {
                bufferIndex = i;
            }
        }
        const bufferedStart = bufferRange.start(bufferIndex);
        const bufferedEnd = bufferRange.end(bufferIndex);
        const bufferedWidth = `${
            ((bufferedEnd - bufferedStart) / video.duration) * 100
        }%`;

        bufferedSegment.style.left = `${
            (bufferedStart / video.duration) * 100
        }%`;
        bufferedSegment.style.width = bufferedWidth;
    }

    if (!quality) return null;

    return (
        <div
            id={"video-player"}
            className="relative w-full flex bg-none group/video"
        >
            {type === "embed" && (
                <div
                    className={`absolute left-0 top-0 right-0 text-white z-50 opacity-0 transition-opacity before:content-[''] before:absolute before:top-0 before:w-full before:-z-10 before:pointer-events-none before:bg-gradient-to-b before:from-black/75 before:to-transparent before:aspect-[3/1] group-hover/video:opacity-100 group-focus-within/video:opacity-100 ${
                        videoRef.current?.paused ? "opacity-100" : ""
                    }`}
                >
                    <a
                        className="block mt-2 ml-4 text-xl text-white no-underline cursor-pointer opacity-[0.85] hover:opacity-100"
                        href={`/video/${video.url}`}
                        target="_blank"
                    >
                        {video.name}
                    </a>
                </div>
            )}
            <video
                ref={videoRef}
                src={`/api/video?v=${video.url}&q=${quality}`}
                className="w-full aspect-video"
                onLoadStart={handleLoadStart}
                onLoadedData={handleLoadedData}
                onTimeUpdate={handleTimeUpdate}
                onPlaying={() => setLoading(false)}
                onClick={handleVideoClick}
                onVolumeChange={handleVolumeChange}
            ></video>
            {/* loading indicator */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div
                    className={`${
                        loading ? "block" : "hidden"
                    }  animate-spin w-12 h-12 border-4 border-solid border-b-transparent rounded-full`}
                ></div>
            </div>
            {/* thumbnail image */}
            <img
                ref={thumbnailImgRef}
                className={`${
                    isScrubbing ? "block" : "hidden"
                } absolute top-0 left-0 right-0 bottom-0 w-full h-full brightness-50`}
            ></img>
            {/* video controls container */}
            <div
                className={`absolute left-0 right-0 bottom-0 text-white z-50 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity before:content-[''] before:absolute before:w-full before:z-[-1] before:pointer-events-none before:bottom-0 before:aspect-[6/1] before:bg-gradient-to-t from-black/75 to-transparent group-hover/video:opacity-100 group-focus-within/video:opacity-100 ${
                    videoRef.current?.paused ? "opacity-100" : ""
                }`}
            >
                {/* timeline container */}
                <div
                    ref={timelineRef}
                    className="group/timeline h-4 ms-2 me-2 cursor-pointer flex items-end"
                    onMouseMove={handleTimelineUpdate}
                    onMouseDown={toggleScrubbing}
                    onTouchStart={handleTouchStartScrubbing}
                >
                    {/* timeline */}
                    <div
                        className={`timeline group-hover/timeline:h-[35%] relative bg-stone-500/50 h-[3px] w-full before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:bg-neutral-400 group-hover/timeline:before:block ${
                            isScrubbing ? "before:block" : "before:hidden"
                        } after:content-[''] after:absolute after:left-0 after:top-0 after:bottom-0 after:bg-violet-500 after:z-[1]`}
                    >
                        {/* preview image */}
                        <img
                            ref={previewImgRef}
                            className={`preview-img ${
                                isScrubbing ? "block" : "hidden"
                            } group-hover/timeline:block absolute h-20 aspect-video top-[-1rem] -translate-x-1/2 -translate-y-full border-2 border-solid rounded border-white`}
                        />
                        {/* thumb */}
                        <div
                            className={`thumb-indicator group-hover/timeline:scale-100 absolute -translate-x-1/2 scale-0 h-[200%] -top-1/2 bg-violet-500 rounded-full transition-transform aspect-[1/1] z-[2]`}
                        ></div>
                        {/* buffered timeline */}
                        <div
                            ref={bufferedRef}
                            className="absolute top-0 bottom-0 h-full bg-white opacity-50"
                        ></div>
                    </div>
                </div>
                {/* controls */}
                <div className="flex gap-2 p-1 items-center">
                    {/* play/pause button */}
                    <ControlButton onClick={handleVideoClick}>
                        {!paused ? <VideoPausedIcon /> : <VideoPlayIcon />}
                    </ControlButton>
                    {/* volume icon */}
                    <div className="flex items-center hover:flex group/vol">
                        <ControlButton onClick={handleMute}>
                            {volumeLevel === "high" ? (
                                <VolumeHighIcon />
                            ) : volumeLevel === "low" ? (
                                <VolumeLowIcon />
                            ) : (
                                <VolumeMutedIcon />
                            )}
                        </ControlButton>
                        {/* volume slider */}
                        <input
                            ref={volumeSliderRef}
                            type="range"
                            min="0"
                            max="1"
                            step="any"
                            className="volume-slider w-[1px] h-[0.3rem] origin-left scale-x-0 transition-all appearance-none cursor-pointer outline-none rounded-2xl bg-gradient-to-r from-white to-stone-500/50 focus-within:w-24 focus-within:scale-x-100 group-hover/vol:w-24 group-hover/vol:scale-x-100"
                            onChange={handleSliderInput}
                        ></input>
                    </div>
                    {/* current time / total time */}
                    <div className="flex items-center gap-1 flex-grow">
                        <div>{time}</div>/
                        <div>
                            {videoRef.current?.duration
                                ? formatDuration(videoRef.current.duration)
                                : "0:00"}
                        </div>
                    </div>
                    {/* playback speed */}
                    <ControlButton
                        className="w-12 text-lg"
                        title="Playback speed"
                        onClick={handleSpeed}
                    >
                        {speed}x
                    </ControlButton>
                    {/* list of video qualities */}
                    <div className="relative min-w-[4rem]" ref={qualityRef}>
                        <ControlButton
                            className="w-full"
                            title="Video resolution"
                            onClick={() => setPopup((prev) => !prev)}
                        >
                            {quality}p
                        </ControlButton>
                        <ul
                            className={`${
                                popup ? "block" : "hidden"
                            } absolute text-center -top-28 bg-stone-900/50 leading-6`}
                        >
                            {qualityList.map((i, idx) => (
                                <ListItem
                                    key={`li-${idx}`}
                                    onClick={() => handleQualitySelect(i)}
                                >
                                    {i}p
                                </ListItem>
                            ))}
                        </ul>
                    </div>
                    {/* full screen button */}
                    <ControlButton
                        onClick={handleFullScreen}
                        disabled={type === "embed"}
                    >
                        {isFullScreen ? <VideoFullClose /> : <VideoFullOpen />}
                    </ControlButton>
                </div>
            </div>
        </div>
    );
};

export default VideoPlayer;
