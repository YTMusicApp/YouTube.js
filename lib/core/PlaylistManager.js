'use strict';

const Playlist = require('../parser/youtube/Playlist');
const { InnertubeError, throwIfMissing } = require('../utils/Utils');

/** @namespace */
class PlaylistManager {
  #actions;

  /**
   * @param {import('../Actions')} actions
   */
  constructor (actions) {
    this.#actions = actions;
  }

  /**
   * Creates a playlist.
   * @param {string} title
   * @param {string[]} video_ids
   */
  async create(title, video_ids) {
    throwIfMissing({ title, video_ids });

    const payload = {
      title,
      videoIds: video_ids
    };

    const response = await this.#actions.execute('/playlist/create', { ...payload, parse: false });

    return {
      playlist_id: response.data.playlistId,
      data: response.data
    };
  }

  /**
   * Deletes a given playlist.
   * @param {string} playlist_id
   */
  async delete(playlist_id) {
    throwIfMissing({ playlist_id });

    const response = await this.#actions.execute('playlist/delete', { playlistId: playlist_id });

    return {
      playlist_id,
      data: response.data
    };
  }

  /**
   * Adds videos to a given playlist.
   * @param {string} playlist_id
   * @param {Array.<string>} video_ids
   */
  async addVideos(playlist_id, video_ids) {
    throwIfMissing({ playlist_id, video_ids });

    const payload = {
      playlistId: playlist_id,
      actions: []
    };

    payload.actions = video_ids.map((id) => ({
      action: 'ACTION_ADD_VIDEO',
      addedVideoId: id
    }));

    const response = await this.#actions.execute('/browse/edit_playlist', { ...payload, parse: false });

    return {
      playlist_id,
      action_result: response.data.actions // TODO: implement actions in the parser
    };
  }

  /**
   * Removes videos from a given playlist.
   *
   * @param {string} playlist_id
   * @param {Array.<string>} video_ids
   */
  async removeVideos(playlist_id, video_ids) {
    throwIfMissing({ playlist_id, video_ids });

    const info = await this.#actions.execute('/browse', { browseId: `VL${playlist_id}`, parse: true });
    const playlist = new Playlist(this.#actions, info, true);

    if (!playlist.info.is_editable)
      throw new InnertubeError('This playlist cannot be edited.', playlist_id);

    const payload = {
      playlistId: playlist_id,
      actions: []
    };

    const getSetVideoIds = async (pl) => {
      const videos = pl.videos.filter((video) => video_ids.includes(video.id));

      videos.forEach((video) =>
        payload.actions.push({
          action: 'ACTION_REMOVE_VIDEO',
          setVideoId: video.set_video_id
        })
      );

      if (payload.actions.length < video_ids.length) {
        const next = await pl.getContinuation();
        return getSetVideoIds(next);
      }
    };

    await getSetVideoIds(playlist);

    if (!payload.actions.length)
      throw new InnertubeError('Given video ids were not found in this playlist.', video_ids);

    const response = await this.#actions.execute('/browse/edit_playlist', { ...payload, parse: false });

    return {
      playlist_id,
      action_result: response.data.actions // TODO: implement actions in the parser
    };
  }

  /**
   * Moves a video to a new position within a given playlist.
   * @param {string} playlist_id
   * @param {string} moved_video_id
   * @param {string} predecessor_video_id
   */
  async moveVideo(playlist_id, moved_video_id, predecessor_video_id) {
    throwIfMissing({ playlist_id, moved_video_id, predecessor_video_id });

    const info = await this.#actions.execute('/browse', { browseId: `VL${playlist_id}`, parse: true });
    const playlist = new Playlist(this.#actions, info, true);

    if (!playlist.info.is_editable)
      throw new InnertubeError('This playlist cannot be edited.', playlist_id);

    const payload = {
      playlistId: playlist_id,
      actions: []
    };

    let set_video_id_0, set_video_id_1;

    const getSetVideoIds = async (pl) => {
      const video_0 = pl.videos.find((video) => moved_video_id === video.id);
      const video_1 = pl.videos.find((video) => predecessor_video_id === video.id);

      set_video_id_0 = set_video_id_0 || video_0?.set_video_id;
      set_video_id_1 = set_video_id_1 || video_1?.set_video_id;

      if (!set_video_id_0 || !set_video_id_1) {
        const next = await pl.getContinuation();
        return getSetVideoIds(next);
      }
    };

    await getSetVideoIds(playlist);

    payload.actions.push({
      action: 'ACTION_MOVE_VIDEO_AFTER',
      setVideoId: set_video_id_0,
      movedSetVideoIdPredecessor: set_video_id_1
    });

    const response = await this.#actions.execute('/browse/edit_playlist', { ...payload, parse: false });

    return {
      playlist_id,
      action_result: response.data.actions // TODO: implement actions in the parser
    };
  }
}

module.exports = PlaylistManager;