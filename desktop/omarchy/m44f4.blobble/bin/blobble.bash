# Blobble: the blob cheers when a long command finishes, and sulks when it fails.

[[ $- == *i* ]] || return 0
BLOBBLE_MIN_SECONDS=${BLOBBLE_MIN_SECONDS:-30}
__blobble_last=

# Bash stamps each history entry with the time it was entered, so the latest entry says which
# command just ran and when it started.
__blobble_done() {
  local status=$? entry num start cmd
  entry=$(HISTTIMEFORMAT='%s ' builtin history 1 2>/dev/null)
  read -r num start cmd _ <<<"$entry"
  if [[ $num != "$__blobble_last" && $start =~ ^[0-9]+$ ]]; then
    if [[ -n $__blobble_last ]] && (($(printf '%(%s)T' -1) - start >= BLOBBLE_MIN_SECONDS)); then
      case "${cmd##*/}" in
        n | nvim | vim | vi | nano | micro | hx | emacs | less | more | man | ssh | mosh | top | htop | btop | \
          tmux | zellij | lazygit | lazydocker | yazi | ranger | claude | codex | python | python3 | node | \
          ipython | sudoedit | watch | journalctl | tail | bash | zsh | fish) ;;
        *) (blobble --bar command "$status" "$(($(printf '%(%s)T' -1) - start))" >/dev/null 2>&1 &) ;;
      esac
    fi
    __blobble_last=$num
  fi
  return $status
}

if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == "declare -a"* ]]; then
  PROMPT_COMMAND=(__blobble_done "${PROMPT_COMMAND[@]}")
else
  PROMPT_COMMAND="__blobble_done${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
